import { join } from "path";
import { execFile } from "child_process";
import { tmpdir } from "os";
import { uuid } from "uuidv4";
import { readFile, unlink } from "fs/promises";

const BIN = join(__dirname, ".\\..\\extraResources\\ImageGenerator.exe");

export async function createImageFromText (text: string):Promise<Buffer> {
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
