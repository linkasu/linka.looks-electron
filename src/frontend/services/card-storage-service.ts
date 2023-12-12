import { ipcRenderer } from "electron";
import { ConfigFile } from "@/common/interfaces/ConfigFile";
import { ICloudStorage } from "@/common/abstract";
import { Directory } from "@/common/interfaces/Directory";

class StorageService extends ICloudStorage {
  downloadImageFromBank (file: string, id: string): Promise<string> {
    return ipcRenderer.invoke("storage:downloadImageFromBank", file, id);
  }

  getArgv (): Promise<string[]> {
    return ipcRenderer.invoke("storage:getArgv");
  }

  downloadAndUnpack (url: string): Promise<void> {
    return ipcRenderer.invoke("storage:downloadAndUnpack", url);
  }

  showItemInFolder (file: string): Promise<void> {
    return ipcRenderer.invoke("storage:showItemInFolder", file);
  }

  mkdir (file: string): Promise<void> {
    return ipcRenderer.invoke("storage:mkdir", file);
  }

  rmdir (file: string): Promise<void> {
    return ipcRenderer.invoke("storage:rmdir", file);
  }

  moveSet (file: string, location: string): Promise<string> {
    return ipcRenderer.invoke("storage:moveSet", file, location);
  }

  defaultToTemp (file: string): string | Promise<string> {
    return ipcRenderer.invoke("storage:defaultToTemp", file);
  }

  saveSet (path: string, location: string, config: ConfigFile): Promise<void> {
    return ipcRenderer.invoke("storage:saveSet", path, location, JSON.parse(JSON.stringify(config)));
  }

  createAudioFromText (path: string, text: string, voice: string): Promise<string | null> {
    return ipcRenderer.invoke("storage:createAudioFromText", path, text, voice);
  }

  createImageFromText (path: string, text: string): Promise<string | null> {
    return ipcRenderer.invoke("storage:createImageFromText", path, text);
  }

  copyToTemp (path: string): Promise<string> {
    return ipcRenderer.invoke("storage:copyToTemp", path);
  }

  selectImage (path: string): Promise<string> {
    return ipcRenderer.invoke("storage:selectImage", path);
  }

  selectAudio (path: string): Promise<string | null> {
    return ipcRenderer.invoke("storage:selectAudio", path);
  }

  async getFiles (path = "") {
    try {
      return ipcRenderer.invoke("storage:getFiles", path) as Promise<Directory>;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async getConfigFile (path: string) {
    try {
      const configFile = await ipcRenderer.invoke("storage:getConfigFile", path);
      return configFile ? (configFile as ConfigFile) : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async getDefaultImage (path: string) {
    try {
      const imageBuffer = await ipcRenderer.invoke("storage:getDefaultImage", path);
      return imageBuffer ? (imageBuffer as Buffer) : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async moveToTrash (path: string) {
    return ipcRenderer.invoke("storage:moveToTrash", path);
  }

  async getImage (path: string, entry: string) {
    try {
      const imageBuffer = await ipcRenderer.invoke("storage:getImage", path, entry);
      return imageBuffer ? (imageBuffer as Buffer) : null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async getAudio (path: string, entry: string) {
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
