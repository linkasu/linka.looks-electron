
import { join } from "path";
import getPath from "platform-folders";
const documentsPath = getPath("documents")!;
const linkedFolderName = "LINKa";
export const HOME_DIR = join(documentsPath, linkedFolderName);
