import { afterEach, describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertZipPath, openLinkaZip } from "@/common/utils/linkaZip";
import { appendZip } from "@/frontend/utils/addToZip";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "linka-zip-test-"));
  roots.push(root);
  const file = join(root, "test.linka");
  const zip = new AdmZip();
  zip.addFile("asset.txt", Buffer.alloc(4096, 65));
  zip.writeZip(file);
  return file;
}

describe("bounded .linka ZIP reading", () => {
  it.each([0, 1, 1024, 501 * 1024 * 1024])(
    "rejects false DEFLATE size %s without replacing source",
    async (size) => {
      const file = fixture();
      const data = readFileSync(file);
      const central = data.indexOf(Buffer.from("PK\x01\x02", "binary"));
      data.writeUInt32LE(size, central + 24);
      data.writeUInt32LE(size, 22);
      writeFileSync(file, data);
      expect(() => openLinkaZip(file)).toThrow();
      await expect(appendZip(file, "config.json", Buffer.from("{}"))).rejects.toThrow();
      expect(readFileSync(file)).toEqual(data);
    }
  );

  it("rejects excessive counts, special files, aliases and unsupported compression before extraction", () => {
    const file = fixture();
    const original = readFileSync(file);
    const central = original.indexOf(Buffer.from("PK\x01\x02", "binary"));
    const end = original.lastIndexOf(Buffer.from("PK\x05\x06", "binary"));
    for (const mutate of [
      (data: Buffer) => {
        data.writeUInt16LE(2001, end + 8);
        data.writeUInt16LE(2001, end + 10);
      },
      (data: Buffer) => data.writeUInt32LE((0xa000 << 16) >>> 0, central + 38),
      (data: Buffer) => data.writeUInt16LE(1, central + 8),
      (data: Buffer) => data.writeUInt16LE(99, central + 10)
    ]) {
      const data = Buffer.from(original);
      mutate(data);
      writeFileSync(file, data);
      expect(() => openLinkaZip(file)).toThrow();
    }
    const zip = new AdmZip();
    zip.addFile("asset.txt", Buffer.from("one"));
    zip.addFile("ASSET.txt", Buffer.from("two"));
    zip.writeZip(file);
    expect(() => openLinkaZip(file)).toThrow("повторяющиеся пути");
  });

  it.each(["../x", "/x", "a/../x", "a\\x", "C:/x", "x\0", "CON", "x.", "a//x"])(
    "rejects unsafe path %s",
    (name) => expect(() => assertZipPath(name)).toThrow("небезопасный путь")
  );

  it("preserves valid assets and accepts empty files through bounded append", async () => {
    const file = fixture();
    await appendZip(file, "empty.txt", Buffer.alloc(0));
    const zip = openLinkaZip(file);
    expect(zip.readFile("asset.txt")).toEqual(Buffer.alloc(4096, 65));
    expect(zip.readFile("empty.txt")?.length).toBe(0);
  });
});
