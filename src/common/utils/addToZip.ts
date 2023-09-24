// require modules
import fs from 'fs'
import archiver from 'archiver'
import AdmZip from 'adm-zip'
import pathModule from 'path'
const fsp = fs.promises
export async function appendZip(source: string, file: string, biff: Buffer) {
  return new Promise(async (resolve) => {
    const tempDir = source + '-temp'
    // create temp dir (folder must exist)
    await fsp.mkdir(tempDir, { recursive: true })
    if (fs.existsSync(source)) {
      new AdmZip(source).extractAllTo(tempDir)
      await fsp.unlink(source)
    }
    await fsp.writeFile(pathModule.join(tempDir, file), biff)

    // recreate zip file to stream archive data to
    const archive = archiver('zip', { zlib: { level: 9 } })
    const output = fs.createWriteStream(source)
    archive.pipe(output)
    // append files from temp directory at the root of archive
    archive.directory(tempDir, false)
    // finalize the archive

    await archive.finalize()
    output.on('close', () => {
      resolve(null)
      fs.rmdirSync(tempDir, { recursive: true })
    })
    // delete temp folder
  })
}
