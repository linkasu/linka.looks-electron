import pathModule from 'path'
import { execFile } from 'child_process'
import { tmpdir } from 'os'
import { readFile, unlink } from 'fs/promises'
import cryptoModule from 'crypto'

const BIN = pathModule.join(__dirname, '.\\..\\extraResources\\bin\\ImageGenerator.exe')

export async function createImageFromText(text: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const file = pathModule.join(tmpdir(), cryptoModule.randomUUID() + '.png')
    execFile(BIN, [file, text], async () => {
      resolve(await readFile(file))
      unlink(file)
    })
  })
}
