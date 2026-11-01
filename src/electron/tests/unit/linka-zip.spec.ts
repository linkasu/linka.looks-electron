import { afterEach, describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertZipPath, openLinkaZip } from "@/common/utils/linkaZip";
import { appendZip } from "@/frontend/utils/addToZip";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixture(data = Buffer.from("hello")) {
  const root = mkdtempSync(join(tmpdir(), "linka-zip-test-"));
  roots.push(root);
  const file = join(root, "test.linka");
  const zip = new AdmZip();
  zip.addFile("asset.txt", data);
  zip.writeZip(file);
  return file;
}

function changeSize(file: string, size: number) {
  const data = readFileSync(file);
  const central = data.indexOf(Buffer.from("PK\x01\x02", "binary"));
  data.writeUInt32LE(size, central + 24);
  data.writeUInt32LE(size, 22);
  writeFileSync(file, data);
}

describe("bounded .linka ZIP reading", () => {
  it("reads old assets, edits atomically and exports a readable archive", async () => {
    const file = fixture();
    expect(openLinkaZip(file).readAsText("asset.txt")).toBe("hello");
    await appendZip(file, "config.json", Buffer.from('{"version":"2.0"}'));
    const zip = openLinkaZip(file);
    expect(zip.readAsText("asset.txt")).toBe("hello");
    expect(JSON.parse(zip.readAsText("config.json"))).toEqual({ version: "2.0" });
  });

  it.each([0, 1, 1024, 501 * 1024 * 1024])("rejects a false DEFLATE size %s", async (size) => {
    const file = fixture(Buffer.alloc(4096, 65));
    changeSize(file, size);
    const before = readFileSync(file);
    expect(() => openLinkaZip(file)).toThrow();
    await expect(appendZip(file, "config.json", Buffer.from("{}"))).rejects.toThrow();
    expect(readFileSync(file)).toEqual(before);
  });

  it("rejects a false STORED size", () => {
    const file = fixture();
    const zip = new AdmZip();
    zip.addFile("asset.txt", Buffer.from("hello"));
    zip.getEntry("asset.txt")!.header.method = 0;
    zip.writeZip(file);
    changeSize(file, 0);
    expect(() => openLinkaZip(file)).toThrow();
  });

  it("accepts empty files without disabling the output limit", () => {
    const file = fixture(Buffer.alloc(0));
    expect(openLinkaZip(file).readFile("asset.txt")?.length).toBe(0);
  });

  it("rejects malformed and truncated archives", () => {
    const file = fixture();
    writeFileSync(file, readFileSync(file).subarray(0, 35));
    expect(() => openLinkaZip(file)).toThrow();
  });

  it("rejects excessive entry counts before loading entries", () => {
    const file = fixture();
    const data = readFileSync(file);
    const end = data.lastIndexOf(Buffer.from("PK\x05\x06", "binary"));
    data.writeUInt16LE(2001, end + 8);
    data.writeUInt16LE(2001, end + 10);
    writeFileSync(file, data);
    expect(() => openLinkaZip(file)).toThrow("слишком много файлов");
  });

  it("limits the aggregate declared output before inflating any entry", () => {
    const file = fixture();
    const zip = new AdmZip();
    zip.addFile("a", Buffer.from("a"));
    zip.addFile("b", Buffer.from("b"));
    zip.writeZip(file);
    const data = readFileSync(file);
    const signature = Buffer.from("PK\x01\x02", "binary");
    for (
      let offset = data.indexOf(signature);
      offset >= 0;
      offset = data.indexOf(signature, offset + 1)
    ) {
      data.writeUInt32LE(300 * 1024 * 1024, offset + 24);
    }
    writeFileSync(file, data);
    expect(() => openLinkaZip(file)).toThrow("слишком большой");
  });

  it("rejects links, including non-symlink special files", () => {
    const file = fixture();
    const data = readFileSync(file);
    const central = data.indexOf(Buffer.from("PK\x01\x02", "binary"));
    for (const mode of [0xa000, 0x1000, 0x6000]) {
      data.writeUInt32LE((mode << 16) >>> 0, central + 38);
      writeFileSync(file, data);
      expect(() => openLinkaZip(file)).toThrow("ссылку или специальный файл");
    }
  });

  it("rejects duplicate names and cross-platform aliases", () => {
    const file = fixture();
    const zip = new AdmZip();
    zip.addFile("asset.txt", Buffer.from("one"));
    zip.addFile("ASSET.txt", Buffer.from("two"));
    zip.writeZip(file);
    expect(() => openLinkaZip(file)).toThrow("повторяющиеся пути");
    const data = readFileSync(file);
    const alias = Buffer.from("ASSET.txt");
    for (let offset = data.indexOf(alias); offset >= 0; offset = data.indexOf(alias, offset + 1)) {
      Buffer.from("asset.txt").copy(data, offset);
    }
    writeFileSync(file, data);
    expect(() => openLinkaZip(file)).toThrow();
  });

  it.each(["../x", "/x", "a/../x", "a\\x", "C:/x", "x\0", "CON", "x.", "a//x"])(
    "rejects unsafe path %s",
    (name) => expect(() => assertZipPath(name)).toThrow("небезопасный путь")
  );

  it("does not replace an archive when saving invalid input", async () => {
    const file = fixture(Buffer.alloc(4096, 65));
    changeSize(file, 0);
    const before = readFileSync(file);
    await expect(appendZip(file, "config.json", Buffer.from("{}"))).rejects.toThrow();
    expect(readFileSync(file)).toEqual(before);
  });
});
