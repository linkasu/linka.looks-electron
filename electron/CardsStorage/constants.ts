
import { join } from "path";
// import getPath from "platform-folders";
const { app } = require('electron');

const documentsPath = app.getPath("documents")!;
const linkedFolderName = "LINKa";
export const HOME_DIR = join(documentsPath, linkedFolderName);
