import AdmZip from "adm-zip";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";

const MAX_UNPACKED_SIZE = 500 * 1024 * 1024;
const MAX_UNPACKED_ENTRIES = 2000;

export function assertZipPath(name: string) {
  const parts = name.replace(/\/$/, "").split("/");
  if (
    /[\\\0:]/.test(name) ||
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
    )
  ) {
    throw new Error("Архив содержит небезопасный путь");
  }
}

export function openLinkaZip(file: string): AdmZip {
  const fd = openSync(file, "r");
  let buffer: Buffer;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_UNPACKED_SIZE) {
      throw new Error("Архив слишком большой");
    }
    // Read only the bounded snapshot, even if another process grows the file.
    buffer = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (!count) throw new Error("Архив изменился во время чтения");
      offset += count;
    }
  } finally {
    closeSync(fd);
  }
  const zip = new AdmZip(buffer);
  if (zip.getEntryCount() > MAX_UNPACKED_ENTRIES) {
    throw new Error("Архив содержит слишком много файлов");
  }
  const entries = zip.getEntries();
  if (entries.length > MAX_UNPACKED_ENTRIES) {
    throw new Error("Архив содержит слишком много файлов");
  }
  let totalSize = 0;
  const names = new Set<string>();
  for (const entry of entries) {
    assertZipPath(entry.entryName);
    const name = entry.entryName.replace(/\/$/, "").normalize("NFC").toLowerCase();
    if (names.has(name)) throw new Error("Архив содержит повторяющиеся пути");
    names.add(name);
    const type = (entry.attr >>> 16) & 0xf000;
    if (type !== 0 && type !== (entry.isDirectory ? 0x4000 : 0x8000)) {
      throw new Error("Архив содержит ссылку или специальный файл");
    }
    if ((entry.header.flags & 1) !== 0 || ![0, 8].includes(entry.header.method)) {
      throw new Error("Архив использует неподдерживаемое сжатие");
    }
    totalSize += Math.max(entry.header.size, entry.header.compressedSize);
    if (totalSize > MAX_UNPACKED_SIZE) throw new Error("Архив слишком большой");
  }
  // adm-zip >=0.6.1 bounds DEFLATE output (including a declared size of zero).
  // STORED output is bounded above by compressedSize; verify actual lengths too.
  for (const entry of entries) {
    if (entry.getData().length !== entry.header.size) {
      throw new Error("Размер файла в архиве не совпадает с заголовком");
    }
  }
  return zip;
}
