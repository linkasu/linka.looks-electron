import { Card } from "@common/interfaces/ConfigFile";
import { storageService } from "@frontend/CardsStorage/index";
import { tts } from "./TTSServer";

export class TTS {
  isPlaying = false;
  audio = new Audio();
  private static _instance: TTS;
  static get instance (): TTS {
    if (TTS._instance == null) {
      TTS._instance = new TTS();
    }
    return TTS._instance;
  }

  public async playCards (file: string, cards: Card[], force = false) {
    if (this.isPlaying) {
      this.isPlaying = false;
      this.audio.pause();
      if (!force) return;
    }
    this.isPlaying = true;
    for (const card of cards) {
      if (!this.isPlaying) break;
      if (card.cardType == 0 && card.audioPath) {
        const buffer = await storageService.getAudio(file, card.audioPath);
        if (!buffer) continue;
        const url = URL.createObjectURL(
          new Blob([buffer], { type: "audio/wav" } /* (1) */)
        );
        await this.playUrl(url);
      }
    }
    this.isPlaying = false;
  }

  public async playText (text: string, voice = "alena"): Promise<void> {
    if (this.isPlaying) { this.audio.pause(); return; }
    this.isPlaying = true;
    const buffer = await tts(text, voice);
    const url = URL.createObjectURL(
      new Blob([buffer], { type: "audio/wav" } /* (1) */)
    );
    await this.playUrl(url);
    this.isPlaying = false;
  }

  private playUrl (url: string) {
    return new Promise((resolve, reject) => {
      this.audio.src = url;
      this.audio.oncanplay = async () => {
        await this.audio.play();
      };
      this.audio.onended = resolve;
    });
  }
}
