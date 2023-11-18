import { storageService } from "@/frontend/services/card-storage-service";
import { Card, CardType } from "@/common/interfaces/ConfigFile";
import { tts } from "./TTSServer";
import axios from "axios";

export class TTS {
  isPlaying = false;
  audio = new Audio();
  private static _instance: TTS;
  static get instance(): TTS {
    if (TTS._instance == null) {
      TTS._instance = new TTS();
    }
    return TTS._instance;
  }

  public async playCards(file: string, cards: Card[], force = false) {
    if (this.isPlaying) {
      this.isPlaying = false;
      this.audio.pause();
      if (!force) return;
    }
    this.isPlaying = true;
    let text = cards.map(({ title }) => title ?? '').join(' ')
    const result = await this.normilize(text)
    
    await this.playText(result, 'alena', true)
    this.isPlaying = false;
  }

  public async playText(text: string, voice = "alena", force = false): Promise<void> {
    if (this.isPlaying&&!force) { this.audio.pause(); return; }
    this.isPlaying = true;
    const buffer = await tts(text, voice);
    const url = URL.createObjectURL(
      new Blob([buffer], { type: "audio/wav" } /* (1) */)
    );
    await this.playUrl(url);
    this.isPlaying = false;
  }

  private playUrl(url: string) {
    return new Promise((resolve, reject) => {
      this.audio.src = url;
      this.audio.oncanplay = async () => {
        await this.audio.play();
      };
      this.audio.onended = resolve;
    });
  }
  private async normilize(phrase: string) {
    return (await axios.post<{ result: string; }>('https://declener.linka.su/normalize', { phrase })).data.result
  }
}
