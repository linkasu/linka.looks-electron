import { ConfigFile } from "../interfaces/ConfigFile";
import { Directory } from "../interfaces/Directory";
import { getMethods } from "../../electron/utils/getMethods";

export abstract class ICloudStorage {
  static getMethods (): Array<keyof ICloudStorage> {
    const mockImplementation = class extends ICloudStorage {
      getArgv (): Promise<string[]> {
        throw new Error("Method not implemented.");
      }

      downloadAndUnpack (url: string): Promise<void> {
        throw new Error("Method not implemented.");
      }

      getFiles (path: string): Promise<Directory | null> {
        throw new Error("Method not implemented.");
      }

      getConfigFile (path: string): ConfigFile | Promise<ConfigFile | null> | null {
        throw new Error("Method not implemented.");
      }

      getDefaultImage (path: string): Buffer | Promise<Uint8Array | null> | null {
        throw new Error("Method not implemented.");
      }

      getImage (path: string, entry: string): Buffer | Promise<Uint8Array | null> | null {
        throw new Error("Method not implemented.");
      }

      getAudio (path: string, entry: string): Buffer | Promise<Uint8Array | null> | null {
        throw new Error("Method not implemented.");
      }

      moveToTrash (path: string): Promise<void> {
        throw new Error("Method not implemented.");
      }

      copyToTemp (path: string): Promise<string> {
        throw new Error("Method not implemented.");
      }

      selectImage (path: string): Promise<string | null> {
        throw new Error("Method not implemented.");
      }

      selectAudio (path: string): Promise<string | null> {
        throw new Error("Method not implemented.");
      }

      createImageFromText (path: string, text: string): Promise<string | null> {
        throw new Error("Method not implemented.");
      }

      createAudioFromText (path: string, text: string, voice: string): Promise<string | null> {
        throw new Error("Method not implemented.");
      }

      defaultToTemp (file: string): string | Promise<string> {
        throw new Error("Method not implemented.");
      }

      saveSet (path: string, location: string, config: ConfigFile): Promise<void> {
        throw new Error("Method not implemented.");
      }

      moveSet (file: string, location: string): Promise<string> {
        throw new Error("Method not implemented.");
      }

      mkdir (file: string): Promise<void> {
        throw new Error("Method not implemented.");
      }

      rmdir (file: string): Promise<void> {
        throw new Error("Method not implemented.");
      }

      showItemInFolder (file: string): Promise<void> {
        throw new Error("Method not implemented.");
      }
    };
    return getMethods<ICloudStorage>(mockImplementation);
  }

  abstract getFiles(path: string): Promise<(Directory | null)>;
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

  abstract mkdir(file: string): Promise<void>;
  abstract rmdir(file: string): Promise<void>;

  abstract downloadAndUnpack(url: string): Promise<void>;

  abstract showItemInFolder(file: string): Promise<void>;

  abstract getArgv(): Promise<string[]>;
}
