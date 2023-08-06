import { app } from 'electron';
import {join} from 'path'
const documentsPath = app.getPath("documents");
const linkedFolderName = 'LINKa';
export const HOME_DIR = join(documentsPath, linkedFolderName);