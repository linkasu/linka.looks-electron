import {join} from 'path'
const documentsPath = join(require('os').homedir(), 'Documents');
const linkedFolderName = 'LINKa';
export const HOME_DIR = join(documentsPath, linkedFolderName);