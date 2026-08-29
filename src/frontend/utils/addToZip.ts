// require modules
import fs from "fs";
import archiver from "archiver";
import AdmZip from "adm-zip";
import { basename, dirname, join } from "path";
import { tmpdir } from "os";
import { v4 as uuid } from "uuid";
const fsp = fs.promises;
export async function appendZip(source: string, file: string, biff: Buffer) {
  const tempDir = await fsp.mkdtemp(join(tmpdir(), "linka-zip-"));
  const tempArchive = join(dirname(source), `.${basename(source)}.${uuid()}.tmp`);
  try {
    if (fs.existsSync(source)) {
      new AdmZip(source).extractAllTo(tempDir);
    }
    await fsp.writeFile(join(tempDir, file), biff);
    const archive = archiver("zip", { zlib: { level: 9 } });
    const output = fs.createWriteStream(tempArchive);

    const outputClosed = new Promise<void>((resolve, reject) => {
      output.on("close", resolve);
      output.on("error", reject);
      archive.on("error", reject);
    });

    archive.pipe(output);
    archive.directory(tempDir, false);

    await archive.finalize();
    await outputClosed;
    await fsp.rename(tempArchive, source);
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
    await fsp.rm(tempArchive, { force: true });
  }
}
