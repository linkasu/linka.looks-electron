import { join } from "path";
import { execFile } from "child_process";
import { tmpdir } from "os";
import { uuid } from "uuidv4";
import { readFile, unlink } from "fs/promises";


const BIN = join(__dirname, '.\\..\\extraResources\\bin\\ImageGenerator.exe')

export async function createImageFromText(text: string):Promise<Buffer>{
    return new Promise((resolve, reject)=>{
        const file = join(tmpdir(),  uuid()+'.png')
        execFile(BIN, [file, text], async ()=>{
            resolve(await readFile(file))
            unlink(file)
        })
    })
}