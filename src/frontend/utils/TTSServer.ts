import axios from "axios";
import { ipcRenderer } from "electron";

export async function tts(text: string, voice: string): Promise<Buffer> {
  if (process.env.TTS_INSTALLATION_TOKENS_ENABLED === "true") {
    return Buffer.from(await ipcRenderer.invoke("tts:anonymous", text, voice));
  }
  const response = await axios.post(
    "https://tts.linka.su/tts",
    { text, voice },
    { responseType: "arraybuffer" }
  );

  return Buffer.from(response.data);
}
