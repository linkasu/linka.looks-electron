import chai from "chai";
import AdmZip from "adm-zip";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { CardType, CURRENT_SET_VERSION, type ConfigFile } from "@/common/interfaces/ConfigFile";

const expect = chai.expect;
const roots: string[] = [];
const tmpFiles: string[] = [];

vi.mock("original-fs", async () => {
  const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    renameSync: fs.renameSync
  };
});

describe("CardsStorage", () => {
  afterEach(() => {
    delete process.env.LINKA_HOME_DIR;
    for (const file of tmpFiles.splice(0)) {
      rmSync(file, { force: true, recursive: true });
    }
    for (const root of roots.splice(0)) {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("reads and normalizes config from linka archives", async () => {
    const homeDir = createHomeDir();
    const storage = await createStorage(homeDir);
    const file = join(homeDir, "legacy.linka");
    writeLinka(file, {
      version: "2.0",
      columns: 1,
      rows: 1,
      withoutSpace: true,
      cards: [{ id: "card-1", cardType: CardType.AudioCard, title: "one" }]
    });

    const config = storage.getConfigFile(file);

    expect(config?.version).to.equal(CURRENT_SET_VERSION);
    expect(config?.withoutSpace).to.equal(true);
    expect(config?.pages).to.have.length(1);
    expect(config?.pages?.[0].cards[0].title).to.equal("one");
  });

  it("creates a default temp set", async () => {
    const homeDir = createHomeDir();
    const storage = await createStorage(homeDir);

    const tmpFile = await storage.defaultToTemp(`default-${Date.now()}.linka`);
    tmpFiles.push(tmpFile);
    const config = readConfig(tmpFile);

    expect(existsSync(tmpFile)).to.equal(true);
    expect(config.version).to.equal(CURRENT_SET_VERSION);
    expect(config.pages?.[0].columns).to.equal(3);
    expect(config.pages?.[0].rows).to.equal(3);
    expect(config.pages?.[0].cards[0].cardType).to.equal(CardType.NewCard);
  });

  it("accepts route-style paths when creating folders and temp sets", async () => {
    const homeDir = createHomeDir();
    const storage = await createStorage(homeDir);

    await storage.mkdir("§folder");
    const tmpFile = await storage.defaultToTemp("folder§nested.linka");
    tmpFiles.push(tmpFile);

    expect(existsSync(join(homeDir, "folder"))).to.equal(true);
    expect(existsSync(tmpFile)).to.equal(true);
  });

  it("rejects unsafe imported linka archives", async () => {
    const homeDir = createHomeDir();
    const storage = await createStorage(homeDir);
    const root = mkdtempSync(join(tmpdir(), "linka-import-test-"));
    roots.push(root);
    const external = join(root, "external.linka");
    writeLinka(external, baseConfig(), {
      "../unsafe.txt": Buffer.from("unsafe")
    });

    try {
      await storage.importExternalSet(external);
      throw new Error("Expected importExternalSet to reject");
    } catch (error) {
      expect((error as Error).message).to.equal("Архив содержит небезопасный путь");
    }
  });

  it("saves normalized sets and converts editor placeholders to empty cards", async () => {
    const homeDir = createHomeDir();
    const storage = await createStorage(homeDir);
    const source = join(homeDir, "source.linka");
    const target = join(homeDir, "target.linka");
    writeLinka(source, baseConfig(), {
      "image.png": Buffer.from("image"),
      "unused.png": Buffer.from("unused")
    });

    await storage.saveSet(source, target, {
      version: CURRENT_SET_VERSION,
      withoutSpace: false,
      pages: [{
        id: "page-1",
        mode: "standard",
        columns: 2,
        rows: 1,
        cards: [
          { id: "audio", cardType: CardType.AudioCard, imagePath: "image.png", title: "one" },
          { id: "new", cardType: CardType.NewCard }
        ]
      }]
    });

    const zip = new AdmZip(target);
    const config = readConfig(target);

    expect(config.pages?.[0].cards[1].cardType).to.equal(CardType.EmptyCard);
    expect(zip.getEntry("image.png")).not.to.equal(null);
    expect(zip.getEntry("unused.png")).to.equal(null);
  });

  it("duplicates, renames and moves sets", async () => {
    const homeDir = createHomeDir();
    const storage = await createStorage(homeDir);
    const source = join(homeDir, "set.linka");
    const targetDir = join(homeDir, "folder");
    mkdirSync(targetDir);
    writeLinka(source, baseConfig());

    const duplicate = await storage.duplicateItem(source);
    const secondDuplicate = await storage.duplicateItem(source);
    const renamed = await storage.renameItem(duplicate, "renamed.linka");
    const moved = await storage.moveSet(renamed, targetDir);

    expect(basename(duplicate)).to.equal("set копия.linka");
    expect(basename(secondDuplicate)).to.equal("set копия 2.linka");
    expect(existsSync(secondDuplicate)).to.equal(true);
    expect(existsSync(renamed)).to.equal(false);
    expect(moved).to.equal(join(targetDir, "renamed.linka"));
    expect(existsSync(moved)).to.equal(true);
  });

  it("merges sets and renames conflicting asset entries", async () => {
    const homeDir = createHomeDir();
    const storage = await createStorage(homeDir);
    const base = join(homeDir, "base.linka");
    const other = join(homeDir, "other.linka");
    writeLinka(base, {
      version: CURRENT_SET_VERSION,
      withoutSpace: false,
      pages: [{
        id: "base-page",
        mode: "standard",
        columns: 1,
        rows: 1,
        cards: [{ id: "base-card", cardType: CardType.AudioCard, imagePath: "shared.png", title: "base" }]
      }]
    }, {
      "shared.png": Buffer.from("base-image")
    });
    writeLinka(other, {
      version: CURRENT_SET_VERSION,
      withoutSpace: false,
      pages: [{
        id: "other-page",
        mode: "standard",
        columns: 1,
        rows: 1,
        cards: [{ id: "other-card", cardType: CardType.AudioCard, imagePath: "shared.png", audioPath: "voice.mp3", title: "other" }]
      }]
    }, {
      "shared.png": Buffer.from("other-image"),
      "voice.mp3": Buffer.from("other-audio")
    });

    const target = await storage.mergeSets(base, other, "merged.linka");
    const zip = new AdmZip(target);
    const config = readConfig(target);
    const otherCard = config.pages?.flatMap((page) => page.cards).find((card) => card.title === "other");

    expect(basename(target)).to.equal("merged.linka");
    expect(config.pages).to.have.length(2);
    expect(otherCard?.id).to.not.equal("other-card");
    expect(otherCard?.imagePath).to.be.a("string");
    expect(otherCard?.imagePath).to.not.equal("shared.png");
    expect(otherCard?.audioPath).to.equal("voice.mp3");
    expect(zip.getEntries().map((entry) => entry.entryName)).to.include(otherCard?.imagePath);
    expect(zip.readFile("shared.png")?.toString()).to.equal("base-image");
    expect(zip.readFile(otherCard?.imagePath ?? "")?.toString()).to.equal("other-image");
    expect(zip.readFile("voice.mp3")?.toString()).to.equal("other-audio");
  });
});

async function createStorage (homeDir: string) {
  process.env.LINKA_HOME_DIR = homeDir;
  vi.resetModules();
  const { CardsStorage } = await import("@/electron/services/card-storage-service");
  return new CardsStorage();
}

function createHomeDir (): string {
  const root = mkdtempSync(join(tmpdir(), "linka-storage-test-"));
  roots.push(root);
  const homeDir = join(root, "LINKa");
  mkdirSync(homeDir);
  return homeDir;
}

function writeLinka (file: string, config: ConfigFile, entries: Record<string, Buffer> = {}) {
  const zip = new AdmZip();
  zip.addFile("config.json", Buffer.from(JSON.stringify(config)));
  Object.entries(entries).forEach(([entryName, buffer]) => {
    zip.addFile(entryName, buffer);
  });
  zip.writeZip(file);
}

function readConfig (file: string): ConfigFile {
  const zip = new AdmZip(file);
  return JSON.parse(zip.readAsText("config.json")) as ConfigFile;
}

function baseConfig (): ConfigFile {
  return {
    version: CURRENT_SET_VERSION,
    withoutSpace: false,
    pages: [{
      id: "page-1",
      mode: "standard",
      columns: 1,
      rows: 1,
      cards: [{ id: "card-1", cardType: CardType.AudioCard, title: "one" }]
    }]
  };
}
