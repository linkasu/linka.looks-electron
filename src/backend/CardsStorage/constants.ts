import pathModule from 'path'
// import getPath from "platform-folders";
import { app } from 'electron'

const documentsPath = app.getPath('documents')!
const linkedFolderName = 'LINKa'
export const HOME_DIR = pathModule.join(documentsPath, linkedFolderName)
