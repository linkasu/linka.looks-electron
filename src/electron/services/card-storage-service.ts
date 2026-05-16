import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync, mkdirSync, readdirSync, lstatSync, copyFileSync, createWriteStream, WriteStream } from "fs";
import { join, basename, extname, normalize, dirname, resolve, sep, isAbsolute } from "path";
import { readdir, copyFile, readFile, rename, mkdir, rm, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { v4 as uuid } from "uuid";
import AdmZip from "adm-zip";
import {
  CardType,
  ConfigFile,
  CURRENT_SET_VERSION,
  createPlaceholderCard,
  normalizeConfigFile,
  normalizePage
} from "@/common/interfaces/ConfigFile";
import { Directory } from "@/common/interfaces/Directory";
import { ICloudStorage } from "../../common/abstract";
import { appendZip } from "@/frontend/utils/addToZip";
import { tts } from "@/frontend/utils/TTSServer";
import { get } from "https";
import delay from "delay";
import { createImageFromText } from "@/electron/utils/ImageFromText";
import { HOME_DIR } from "../../common/constants";
import { renameSync } from "original-fs";
import axios from "axios";
import { resolveExtraResource } from "@/electron/utils/resolveExtraResource";
import { assertValidStorageName } from "@/common/utils/storageName";

const DEFAULT_SETS = resolveExtraResource("defaultSets");
const DEFAULT_SEED_ITEMS = [
  "Клавиатура.linka",
  "Крупная клавиатура",
  "цифры знаки.linka"
];
const DEFAULT_SETS_URL = "https://linka.su/dist/linka.looks/sasha.sets.zip";
const MAX_UNPACKED_SIZE = 500 * 1024 * 1024;
const MAX_UNPACKED_ENTRIES = 2000;

let win: BrowserWindow | null = null;

export class CardsStorage extends ICloudStorage {
  private readonly tempPaths = new Set<string>();

  constructor () {
    super();
    this.init();
    const methods: Array<keyof ICloudStorage> = ICloudStorage.getMethods();
    // binding dispatched events from the frontend-process
    // to the corresponding handlers in the backend-process
    // (backend-process has its own implementation of the same interface)
    // ((you're looking at it rn btw))
    for (const method of methods) {
      ipcMain.handle("storage:" + method, (_, ...args) => {
        win = BrowserWindow.fromWebContents(_.sender);

        return (this[method] as (...args: Array<string | ConfigFile>) => void)(...args);
      });
    }
  }

  init () {
    try {
      mkdirSync(HOME_DIR, { recursive: true });
    } catch (error) {
      dialog.showErrorBox(
        "Не удалось открыть папку LINKa",
        `Проверьте доступ к папке: ${HOME_DIR}`
      );
      throw error;
    }
    this.copyDefaultSets(DEFAULT_SETS, HOME_DIR);
  }

  async showItemInFolder (path: string) {
    const s = this.checkPath(path);
    console.log(s);

    shell.showItemInFolder(s);
  }

  async getFiles (path = ""): Promise<(Directory)> {
    const dir = this.checkPath(path);
    const files = (await readdir(dir)).map((f) => join(dir, f));

    return files.map((file) => {
      if (file.endsWith(" ")) {
        renameSync(file, file.trim());
      }
      try {
        if (lstatSync(file).isDirectory()) {
          return {
            directory: true,
            set: undefined,
            file
          };
        } else if (file.endsWith(".linka")) {
          return {
            directory: false,
            set: this.getConfigFile(file),
            file
          };
        }
      } catch {
        return null;
      }
      return null;
    }).filter(f => f !== null) as Directory;
  }

  getConfigFile (path: string) {
    const zip = new AdmZip(this.checkPath(path));
    const raw = zip.readAsText("config.json");
    try {
      return normalizeConfigFile(JSON.parse(raw) as ConfigFile);
    } catch (error) {
      console.log(raw);

      console.error(error);
    }
    return null;
  }

  private checkPath (path: string): string {
    const home = resolve(HOME_DIR);
    if (!path || path === "/" || path === "§") return home;

    const normalized = normalize(path.includes("§")
      ? path.replace(/§/g, "/").replace(/^[/\\]+/, "")
      : path);
    const resolved = isAbsolute(normalized) ? resolve(normalized) : resolve(HOME_DIR, normalized);

    if (this.tempPaths.has(resolved)) {
      return resolved;
    }

    if (resolved === home || resolved.startsWith(home + sep)) {
      return resolved;
    }

    throw new Error("Путь вне папки LINKa");
  }

  getImage (path: string, entry: string) {
    if (!path) return null;
    return this.getBuffer(path, entry);
  }

  private getBuffer (path: string, entry: string) {
    const zip = new AdmZip(this.checkPath(path));
    return zip.readFile(entry);
  }

  getAudio (path: string, entry: string) {
    return this.getBuffer(path, entry);
  }

  getDefaultImage (path: string) {
    const config = this.getConfigFile(this.checkPath(path));
    if (!config) return null;
    const card = (config.pages ?? [])
      .flatMap((page) => page.cards ?? [])
      .find((c) => !!c.imagePath);
    if (!card) return null;
    const entry = card.imagePath;
    if (!entry) return null;
    return this.getImage(path, entry);
  }

  public mkdir (file: string): Promise<void> {
    const target = this.checkPath(file);
    assertValidStorageName(basename(target));
    return mkdir(target);
  }

  public rmdir (file: string): Promise<void> {
    return rm(this.checkPath(file), { force: true, recursive: true });
  }

  public moveToTrash (path: string): Promise<void> {
    return shell.trashItem(this.checkPath(path));
  }

  public async copyToTemp (path: string): Promise<string> {
    path = this.checkPath(path);
    const tmp = await this.getTmpFilename(path);
    await copyFile(path, tmp);
    return tmp;
  }

  private async getTmpFilename (path: string) {
    const dir = await mkdtemp(join(tmpdir(), "linka-set-"));
    const tmp = join(dir, `${uuid()}${extname(path) || ".linka"}`);
    this.tempPaths.add(resolve(tmp));
    return tmp;
  }

  public async selectImage (path: string) {
    return this.selectFile(path, "Изображение", ["png", "jpg", "jpeg", "gif"]);
  }

  selectAudio (path: string): Promise<string | null> {
    return this.selectFile(path, "Звук", ["mp3", "wav", "ogg"]);
  }

  private async selectFile (path: string, name: string, extensions: string[]) {
    if (!win) {
      return null;
    }
    const res = await dialog
      .showOpenDialog(win, {
        filters: [
          {
            name,
            extensions
          }
        ]
      });
    if (res.canceled) return null;
    path = this.checkPath(path);

    return this.addFile(path, res.filePaths[0]);
  }

  async createAudioFromText (path: string, text: string, voice: string): Promise<string | null> {
    const buff = await tts(text, voice);
    return this.addBuffer(path, buff, "mp3");
  }

  async createImageFromText (path: string, text: string): Promise<string | null> {
    const buffer = await createImageFromText(text);

    return this.addBuffer(path, buffer, "png");
  }

  async downloadImageFromBank (path: string, id: string): Promise<string> {
    const buffer = await axios.get(`https://pictures.linka.su/picture/${id}/buffer`, { responseType: "arraybuffer" });
    return this.addBuffer(path, Buffer.from(buffer.data), "png");
  }

  async defaultToTemp (path: string): Promise<string> {
    assertValidStorageName(basename(this.checkPath(path)));
    const tmp = await this.getTmpFilename(path);
    const config: ConfigFile = {
      withoutSpace: false,
      directSet: false,
      quizAutoNext: true,
      quizReadQuestion: false,
      version: CURRENT_SET_VERSION,
      pages: [
        normalizePage({
          mode: "standard",
          columns: 3,
          rows: 3,
          cards: [createPlaceholderCard()]
        })
      ]
    };
    const json = JSON.stringify(config);
    await this.addBuffer(tmp, Buffer.from(json), "json", "config");
    await delay(300);

    return tmp;
  }

  async saveSet (path: string, location: string, config: ConfigFile): Promise<void> {
    path = this.checkPath(path);
    location = this.checkPath(location);
    assertValidStorageName(basename(location));
    const normalized = normalizeConfigFile(config);
    if (!normalized) throw new Error("Некорректная конфигурация набора");

    await this.cleanFile(path, normalized);
    normalized.pages = (normalized.pages ?? []).map((page) => {
      const normalizedPage = normalizePage(page);
      normalizedPage.cards = normalizedPage.cards.filter(Boolean).map((card) => {
        if (card.cardType === CardType.NewCard) {
          return {
            id: uuid(),
            cardType: CardType.EmptyCard,
            matchLane: card.matchLane
          };
        }
        return card;
      });
      return normalizedPage;
    });

    const json = JSON.stringify(normalized);
    await this.addBuffer(path, Buffer.from(json), "json", "config");
    await delay(500);
    await copyFile(path, location);
  }

  async moveSet (file: string, location: string) {
    file = this.checkPath(file);
    location = this.checkPath(location);
    const target = join(location, basename(file));
    await rename(file, target);
    return target;
  }

  async duplicateItem (path: string): Promise<string> {
    const source = this.checkPath(path);
    const target = this.getDuplicatePath(source);
    if (lstatSync(source).isDirectory()) {
      this.copyFolderSync(source, target);
    } else {
      await copyFile(source, target);
    }
    return target;
  }

  async renameItem (path: string, newName: string): Promise<string> {
    assertValidStorageName(newName);
    const source = this.checkPath(path);
    const target = this.checkPath(join(dirname(source), newName));
    await rename(source, target);
    return target;
  }

  async mergeSets (basePath: string, otherPath: string, targetName?: string): Promise<string> {
    const base = this.checkPath(basePath);
    const other = this.checkPath(otherPath);
    const baseConfig = this.getConfigFile(base);
    const otherConfig = this.getConfigFile(other);
    if (!baseConfig || !otherConfig) {
      throw new Error("Не удалось прочитать наборы");
    }

    const tmp = await this.copyToTemp(base);
    const zipBase = new AdmZip(tmp);
    const zipOther = new AdmZip(other);
    const baseEntries = zipBase.getEntries();
    baseEntries.forEach((entry) => entry.getData());
    const existingEntries = new Set(baseEntries.map((e) => e.entryName));
    const entryMap = new Map<string, string>();

    const copyEntry = (name?: string) => {
      if (!name) return name;
      if (entryMap.has(name)) return entryMap.get(name);
      const entry = zipOther.getEntry(name);
      if (!entry) return name;
      let newName = name;
      if (existingEntries.has(newName)) {
        const ext = extname(name);
        newName = uuid() + ext;
      }
      existingEntries.add(newName);
      zipBase.addFile(newName, entry.getData());
      entryMap.set(name, newName);
      return newName;
    };

    const otherPages = (otherConfig.pages ?? []).map((page) => {
      const copy = JSON.parse(JSON.stringify(page));
      copy.id = uuid();
      copy.cards = (copy.cards ?? []).filter(Boolean).map((card: Record<string, unknown>) => {
        const next = JSON.parse(JSON.stringify(card));
        next.id = uuid();
        if (next.imagePath) next.imagePath = copyEntry(next.imagePath);
        if (next.audioPath) next.audioPath = copyEntry(next.audioPath);
        return next;
      });
      return normalizePage(copy);
    });

    const mergedTmp = `${tmp}.merged`;
    zipBase.writeZip(mergedTmp);
    await rename(mergedTmp, tmp);

    const mergedConfig: ConfigFile = {
      ...baseConfig,
      pages: [...(baseConfig.pages ?? []), ...otherPages]
    };

    const target = this.getMergeTargetPath(base, other, targetName);
    await this.saveSet(tmp, target, mergedConfig);
    return target;
  }

  private cleanFile (path: string, config: ConfigFile) {
    const paths = [];
    for (const page of config.pages ?? []) {
      for (const card of page.cards.filter(Boolean)) {
        if (card.cardType === CardType.AudioCard) {
          paths.push(card.audioPath);
          paths.push(card.imagePath);
        }
      }
    }
    const zip = new AdmZip(path);
    const entries = zip.getEntries();
    for (const entry of entries) {
      if (!paths.includes(entry.name)) {
        zip.deleteFile(entry);
      }
    }

    return zip.writeZipPromise();
  }

  private async addFile (path: string, file: string) {
    const buff = await readFile(file);
    path = this.checkPath(path);
    const ext = extname(file);

    return this.addBuffer(path, buff, ext);
  }

  async addBuffer (path: string, buff: Buffer, ext: string, name?: string) {
    if (!name) name = uuid();
    // const zip = new AdmZip(path)
    // zip.addFile(name+'.'+ext, buff);
    // await zip.writeZipPromise()
    const file = name + "." + ext;
    await appendZip(path, file, buff);
    return file;
  }

  private getDuplicatePath (source: string): string {
    const isDir = lstatSync(source).isDirectory();
    const ext = isDir ? "" : extname(source);
    const base = basename(source, ext);
    const dir = dirname(source);
    const suffix = " копия";
    let candidate = join(dir, `${base}${suffix}${ext}`);
    let index = 2;
    while (existsSync(candidate)) {
      candidate = join(dir, `${base}${suffix} ${index}${ext}`);
      index++;
    }
    return candidate;
  }

  private getMergeTargetPath (basePath: string, otherPath: string, targetName?: string): string {
    const ext = extname(basePath) || ".linka";
    const baseName = basename(basePath, ext);
    const otherName = basename(otherPath, ext);
    const dir = dirname(basePath);
    const mergedName = targetName && targetName.trim().length > 0
      ? targetName.trim()
      : `${baseName} + ${otherName}`;
    const safeName = basename(mergedName);
    assertValidStorageName(safeName);
    const nameBase = safeName.toLowerCase().endsWith(ext)
      ? safeName.slice(0, -ext.length)
      : safeName;
    let candidate = join(dir, nameBase + ext);
    let index = 2;
    while (existsSync(candidate)) {
      candidate = join(dir, `${nameBase} ${index}${ext}`);
      index++;
    }
    return candidate;
  }

  async downloadAndUnpack (url: string): Promise<void> {
    if (url !== DEFAULT_SETS_URL) {
      throw new Error("Недопустимый адрес загрузки наборов");
    }
    const file = await this.getTmpFilename(basename(url));
    const stream = createWriteStream(file);
    await this.downloadToStream(url, stream);
    await this.unpack(file, HOME_DIR);
  }

  private unpack (file: string, target: string) {
    return new Promise((resolve, reject) => {
      const zip = new AdmZip(file);
      this.validateZipEntries(zip);
      zip.extractAllToAsync(target, true, undefined, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(void 0);
      });
    });
  }

  private validateZipEntries (zip: AdmZip) {
    const entries = zip.getEntries();
    if (entries.length > MAX_UNPACKED_ENTRIES) {
      throw new Error("Архив содержит слишком много файлов");
    }
    let totalSize = 0;
    for (const entry of entries) {
      const name = entry.entryName.replace(/\\/g, "/");
      const normalized = normalize(name);
      if (normalized.startsWith("..") || isAbsolute(normalized)) {
        throw new Error("Архив содержит небезопасный путь");
      }
      totalSize += entry.header.size;
      if (totalSize > MAX_UNPACKED_SIZE) {
        throw new Error("Архив слишком большой");
      }
    }
  }

  private downloadToStream (url: string, stream: WriteStream) {
    return new Promise((resolve, reject) => {
      const request = get(url, (response) => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Ошибка загрузки: ${response.statusCode}`));
          response.resume();
          return;
        }
        const len = parseInt(response.headers["content-length"] ?? "0", 10);
        let cur = 0;

        response.on("data", (chunk) => {
          cur += chunk.length;
          if (len > 0 && win) { win.webContents.send("download_progress", (100.0 * cur / len).toFixed(2)); }
        });

        stream.on("finish", () => {
          resolve(void 0);
        });
        stream.on("error", reject);
        response.on("error", reject);
        response.pipe(stream);
      });
      request.on("error", reject);
    });
  }

  private copyFolderSync (srcPath: string, destPath: string) {
    mkdirSync(destPath, { recursive: true });
    readdirSync(srcPath).forEach((file: string) => {
      const srcFilePath = join(srcPath, file);
      const destFilePath = join(destPath, file);

      if (lstatSync(srcFilePath).isDirectory()) {
        this.copyFolderSync(srcFilePath, destFilePath);
      } else {
        if (existsSync(destFilePath)) {
          return;
        }
        copyFileSync(srcFilePath, destFilePath);
      }
    });
  }

  private copyDefaultSets (srcPath: string, destPath: string) {
    mkdirSync(destPath, { recursive: true });
    DEFAULT_SEED_ITEMS.forEach((file: string) => {
      const srcFilePath = join(srcPath, file);
      const destFilePath = join(destPath, file);
      if (!existsSync(srcFilePath) || existsSync(destFilePath)) {
        return;
      }
      if (lstatSync(srcFilePath).isDirectory()) {
        this.copyFolderSync(srcFilePath, destFilePath);
        return;
      }
      copyFileSync(srcFilePath, destFilePath);
    });
  }

  async getArgv (): Promise<string[]> {
    return process.argv;
  }

  async importExternalSet (path: string): Promise<string> {
    const source = resolve(path);
    if (extname(source).toLowerCase() !== ".linka") {
      throw new Error("Можно импортировать только .linka файл");
    }
    assertValidStorageName(basename(source));
    this.validateZipEntries(new AdmZip(source));
    const home = resolve(HOME_DIR);
    if (source === home || source.startsWith(home + sep)) {
      return source;
    }
    const initialTarget = join(HOME_DIR, basename(source));
    const target = existsSync(initialTarget) ? this.getDuplicatePath(initialTarget) : initialTarget;
    await copyFile(source, target);
    return target;
  }
}
