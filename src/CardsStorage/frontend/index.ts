import { ipcRenderer } from "electron";
import { ConfigFile } from "@/interfaces/ConfigFile";
    import { ICloudStorage } from "../abstract";
import { Directory } from "@/interfaces/Directory";

class StorageService extends ICloudStorage {
  async getFiles(path = ""){
    try {
      return ipcRenderer.invoke("storage:getFiles", path.replace(/§/g, '/')) as Promise< Directory>;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async getConfigFile(path: string) {
    try {
      const configFile = await ipcRenderer.invoke("storage:getConfigFile", path);
      return configFile ? (configFile as ConfigFile) : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async getDefaultImage(path: string) {
    try {
      const imageBuffer = await ipcRenderer.invoke("storage:getDefaultImage", path);
      return imageBuffer ? (imageBuffer as Buffer) : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
  async getImage(path: string, entry: string) {
    try {
      const imageBuffer = await ipcRenderer.invoke("storage:getImage", path, entry);
      return imageBuffer ? (imageBuffer as Buffer) : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
  async getAudio(path: string, entry: string) {
    try {
      const imageBuffer = await ipcRenderer.invoke("storage:getAudio", path, entry);
      return imageBuffer ? (imageBuffer as Buffer) : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }
}

export const storageService = new StorageService();
