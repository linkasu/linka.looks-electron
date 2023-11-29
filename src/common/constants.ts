import { homedir, userInfo } from "os";
import { join } from "path";
const documentsPath = join( homedir(), "Documents");
const linkedFolderName = "LINKa";
export const HOME_DIR = join(documentsPath, linkedFolderName);
