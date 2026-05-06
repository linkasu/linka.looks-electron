// require modules
import fs from "fs";
import archiver from "archiver";
import AdmZip from "adm-zip";
import { join } from "path";
const fsp = fs.promises;
export async function appendZip (source: string, file: string, biff: Buffer) {
  const tempDir = source + "-temp";
  try {
    await fsp.mkdir(tempDir, { recursive: true });

    if (fs.existsSync(source)) {
      new AdmZip(source).extractAllTo(tempDir);
      await fsp.unlink(source);
    }
    await fsp.writeFile(join(tempDir, file), biff);
    const archive = archiver("zip", { zlib: { level: 9 } });
    const output = fs.createWriteStream(source);

    const outputClosed = new Promise<void>((resolve, reject) => {
      output.on("close", resolve);
      output.on("error", reject);
      archive.on("error", reject);
    });

    archive.pipe(output);
    archive.directory(tempDir, false);

    await archive.finalize();
    await outputClosed;
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}
