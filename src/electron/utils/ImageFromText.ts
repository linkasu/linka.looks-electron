import { join } from "path";
import { execFile } from "child_process";
import { tmpdir } from "os";
import { v4 as uuid } from "uuid";
import { readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { resolveExtraResource } from "@/electron/utils/resolveExtraResource";

const BIN = resolveExtraResource("ImageGenerator.exe");

export async function createImageFromText (text: string):Promise<Buffer> {
  if (process.platform !== "win32") {
    throw new Error("Создание картинки из текста поддерживается только на Windows");
  }
  if (!existsSync(BIN)) {
    throw new Error("Не найден ImageGenerator.exe");
  }

  return new Promise((resolve, reject) => {
    const file = join(tmpdir(), uuid() + ".png");
    execFile(BIN, [file, text], async (err) => {
      if (err) {
        console.error(err);

        return reject(err);
      }

      try {
        const buffer = await readFile(file);
        await unlink(file).catch((error) => console.warn("Failed to remove generated image:", error));
        resolve(buffer);
      } catch (error) {
        reject(error);
      }
    });
  });
}
