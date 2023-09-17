import { join } from "path";
import { execFile } from "child_process";
import { tmpdir } from "os";
import { readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";

const BIN = join(__dirname, ".\\..\\extraResources\\bin\\ImageGenerator.exe");

export async function createImageFromText (text: string):Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const file = join(tmpdir(), randomUUID() + ".png");
    execFile(BIN, [file, text], async () => {
      resolve(await readFile(file));
      unlink(file);
    });
  });
}
