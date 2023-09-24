import { BrowserWindow, dialog, ipcMain, IpcMainEvent, IpcMainInvokeEvent, ipcRenderer, shell } from "electron";
import { existsSync, mkdirSync, readdirSync, lstatSync, copyFileSync, createWriteStream, WriteStream } from "fs";
import { join, basename, extname, normalize } from "path";
import { readdir, unlink, copyFile, readFile, rename, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { uuid } from "uuidv4";
import AdmZip from "adm-zip";
import { ConfigFile } from "@/common/interfaces/ConfigFile";
import { Directory } from "@/common/interfaces/Directory";
import { ICloudStorage } from "../common/abstract";
// @ts-ignore
import { appendZip } from "@frontend/utils/addToZip";
// @ts-ignore
import { tts } from "@frontend/utils/TTSServer";
import { get } from "https";
import delay from "delay";
// @ts-ignore
import { createImageFromText } from "@frontend/utils/ImageFromText";
import { HOME_DIR } from "../common/constants";

const DEFAULT_SETS = join(__dirname, "./../extraResources/defaultSets");

let win: BrowserWindow | null = null;

export class CardsStorage extends ICloudStorage {
  constructor () {
    super();
    this.init();
    const methods: Array<keyof ICloudStorage> = ICloudStorage.getMethods();
    // binding dispatched events from the frontend-process
    // to the corresponding handlers in the backend-process
    // (backend-process has its own implementation of the same interface)
    // ((you're looking at it rn btw))
    for (const method of methods) {
      ipcMain.handle("storage:" + method, (_, ...args: any) => {
        function tuple<T extends any[]> (...args: T): T {
          return args;
        }
        win = BrowserWindow.fromWebContents(_.sender);
        const argsAsTuple = tuple<any>(...args);

        return (this[method] as (...args: Array<string | ConfigFile>) => void)(...argsAsTuple);
      });
    }
  }

  init () {
    if (!existsSync(HOME_DIR)) {
      mkdirSync(HOME_DIR);
      this.copyFolderSync(DEFAULT_SETS, HOME_DIR);
    }
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
      } catch (error) {
        return null;
      }
      return null;
    }).filter(f => f != null) as Directory;
  }

  getConfigFile (path: string) {
    const zip = new AdmZip(this.checkPath(path));
    const raw = zip.readAsText("config.json");
    try {
      return JSON.parse(raw) as ConfigFile;
    } catch (error) {
      console.log(raw);

      console.error(error);
    }
    return null;
  }

  private checkPath (path: string): string {
    if (path[1] === ":") return path;
    return normalize(path.includes(HOME_DIR) || path.includes(tmpdir()) ? path : join(HOME_DIR, path).replace(/§/g, "/"));
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
    const card = config.cards.find(c => !!c.imagePath);
    if (!card) return null;
    const entry = card.imagePath;
    if (!entry) return null;
    return this.getImage(path, entry);
  }

  public mkdir (file: string): Promise<void> {
    return mkdir(this.checkPath(file));
  }

  public rmdir (file: string): Promise<void> {
    return rm(this.checkPath(file), { force: true, recursive: true });
  }

  public moveToTrash (path: string): Promise<void> {
    return shell.trashItem(this.checkPath(path));
  }

  public async copyToTemp (path: string): Promise<string> {
    path = this.checkPath(path);
    const tmp = this.getTmpFilename(path);
    await copyFile(path, tmp);
    return tmp;
  }

  private getTmpFilename (path: string) {
    return join(tmpdir(), basename(path));
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
    return this.addBuffer(path, buff, ".mp3");
  }

  async createImageFromText (path: string, text: string): Promise<string | null> {
    const buffer = await createImageFromText(text);

    return this.addBuffer(path, buffer, ".png");
  }

  async defaultToTemp (path: string): Promise<string> {
    path = this.checkPath(path);
    const tmp = join(tmpdir(), basename(path));
    const config: ConfigFile = {
      columns: 3,
      rows: 3,
      cards: [],
      withoutSpace: false,
      directSet: false,
      version: "2.0"
    };
    const json = JSON.stringify(config);
    await this.addBuffer(tmp, Buffer.from(json), "json", "config");
    await delay(300);

    return tmp;
  }

  async saveSet (path: string, location: string, config: ConfigFile): Promise<void> {
    path = this.checkPath(path);
    location = this.checkPath(location);
    // await this.cleanFile(pat, config)
    config.cards = config.cards.map((card) => {
      if (card.cardType > 2) {
        card = {
          id: uuid(),
          cardType: 2
        };
      }
      return card;
    });

    const json = JSON.stringify(config);
    JSON.parse(json);
    try {
      await this.addBuffer(path, Buffer.from(json), "json", "config");
    } catch (error) {
      console.error(error);

      return;
    }
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

  private cleanFile (path: string, config: ConfigFile) {
    const paths = [];
    for (const card of config.cards) {
      if (card.cardType === 0) {
        paths.push(card.audioPath);
        paths.push(card.imagePath);
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
    const file = name + "." + ext!;
    await appendZip(path, file, buff);
    return file;
  }

  async downloadAndUnpack (url: string): Promise<void> {
    const file = this.getTmpFilename(basename(url));
    const stream = createWriteStream(file);
    await this.downloadToStream(url, stream);
    await this.unpack(file, HOME_DIR);
  }

  private unpack (file: string, target: string) {
    return new Promise((resolve, reject) => {
      const zip = new AdmZip(file);
      zip.extractAllToAsync(target, true, undefined, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(void 0);
      });
    });
  }

  private downloadToStream (url: string, stream: WriteStream) {
    return new Promise((resolve, reject) => {
      const request = get(url, (response) => {
        if (!response.headers["content-length"]) return;
        const len = parseInt(response.headers["content-length"], 10);
        let cur = 0;

        response.pipe(stream);
        response.on("data", (chunk) => {
          cur += chunk.length;
          if (win) { win.webContents.send("download_progress", (100.0 * cur / len).toFixed(2)); }
        });

        response.on("end", () => {
          resolve(void 0);
        });

        request.on("error", (e) => {
          reject(e);
        });
      });
    });
  }

  private copyFolderSync (srcPath: string, destPath: string) {
    mkdirSync(destPath, { recursive: true });
    readdirSync(srcPath).forEach((file: string) => {
      const srcFilePath = join(srcPath, file);
      const destFilePath = join(destPath, file);
      console.log(destFilePath);
      if (lstatSync(srcFilePath).isDirectory()) {
        this.copyFolderSync(srcFilePath, destFilePath);
      } else {
        copyFileSync(srcFilePath, destFilePath);
      }
    });
  }

  async getArgv (): Promise<string[]> {
    return process.argv;
  }
}
