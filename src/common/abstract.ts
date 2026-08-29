import { ConfigFile } from "@/common/interfaces/ConfigFile";
import { Directory } from "@/common/interfaces/Directory";

export abstract class ICloudStorage {
  static getMethods(): Array<keyof ICloudStorage> {
    return [
      "getFiles",
      "getConfigFile",
      "getDefaultImage",
      "getImage",
      "getAudio",
      "moveToTrash",
      "copyToTemp",
      "selectImage",
      "selectAudio",
      "createImageFromText",
      "createAudioFromText",
      "defaultToTemp",
      "saveSet",
      "moveSet",
      "duplicateItem",
      "renameItem",
      "mergeSets",
      "mkdir",
      "rmdir",
      "downloadAndUnpack",
      "showItemInFolder",
      "getArgv",
      "importExternalSet",
      "downloadImageFromBank"
    ];
  }

  abstract getFiles(path: string): Promise<Directory | null>;
  abstract getConfigFile(path: string): ConfigFile | null | Promise<ConfigFile | null>;
  abstract getDefaultImage(path: string): Buffer | null | Promise<Uint8Array | null>;
  abstract getImage(path: string, entry: string): Buffer | null | Promise<Uint8Array | null>;
  abstract getAudio(path: string, entry: string): Buffer | null | Promise<Uint8Array | null>;
  abstract moveToTrash(path: string): Promise<void>;
  abstract copyToTemp(path: string): Promise<string>;
  abstract selectImage(path: string): Promise<string | null>;
  abstract selectAudio(path: string): Promise<string | null>;
  abstract createImageFromText(path: string, text: string): Promise<string | null>;
  abstract createAudioFromText(path: string, text: string, voice: string): Promise<string | null>;
  abstract defaultToTemp(file: string): string | Promise<string>;
  abstract saveSet(path: string, location: string, config: ConfigFile): Promise<void>;
  abstract moveSet(file: string, location: string): Promise<string>;
  abstract duplicateItem(path: string): Promise<string>;
  abstract renameItem(path: string, newName: string): Promise<string>;
  abstract mergeSets(basePath: string, otherPath: string, targetName?: string): Promise<string>;

  abstract mkdir(file: string): Promise<void>;
  abstract rmdir(file: string): Promise<void>;

  abstract downloadAndUnpack(url: string): Promise<void>;

  abstract showItemInFolder(file: string): Promise<void>;

  abstract getArgv(): Promise<string[]>;

  abstract importExternalSet(path: string): Promise<string>;

  abstract downloadImageFromBank(file: string, id: string): Promise<string>;
}
