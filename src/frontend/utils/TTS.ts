import { storageService } from "@/frontend/services/card-storage-service";
import { Card, CardType } from "@/common/interfaces/ConfigFile";
import { tts } from "./TTSServer";
import { Voice } from "@/common/interfaces/Voice";
import axios from "axios";
import store from "@/frontend/store";
import { reactive } from "vue";

export class TTS {
  isPlaying = false;
  audio = new Audio();
  private _playId = 0;
  private static _instance: TTS;
  static get instance (): TTS {
    if (TTS._instance == null) {
      TTS._instance = new TTS();
    }
    return TTS._instance;
  }

  static voices:Voice[] = reactive([]);

  constructor () {
    this.getVoices();
  }

  private async getVoices () {
    if (TTS.voices.length > 0) return;
    const { data } = await axios.get<{id: string, lang_code:string, name: string}[]>("https://tts.linka.su/voices");
    TTS.voices.push(...data.map(v => ({
      value: v.id,
      text: v.name + " (" + v.lang_code + ")",
      langCode: v.lang_code
    })));
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
      if (card.cardType === CardType.AudioCard && card.audioPath) {
        const buffer = await storageService.getAudio(file, card.audioPath);
        if (!buffer) continue;
        const url = URL.createObjectURL(
          new Blob([buffer], { type: "audio/mp3" } /* (1) */)
        );
        await this.playUrl(url);
      }
    }
    this.isPlaying = false;
  }

  public async playText (text: string, voice?: string): Promise<void> {
    if (this.isPlaying) { this.audio.pause(); return; }
    this.isPlaying = true;
    const buffer = await tts(text, voice ?? this.resolveVoice(text));
    const url = URL.createObjectURL(
      new Blob([buffer], { type: "audio/mp3" } /* (1) */)
    );
    await this.playUrl(url);
    this.isPlaying = false;
  }

  public stop (): void {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlaying = false;
  }

  public async forcePlayText (text: string, voice?: string): Promise<void> {
    this.stop();
    const myId = ++this._playId;
    this.isPlaying = true;
    const buffer = await tts(text, voice ?? this.resolveVoice(text));
    if (myId !== this._playId) return;
    const url = URL.createObjectURL(
      new Blob([buffer], { type: "audio/mp3" } /* (1) */)
    );
    await this.playUrl(url);
    if (myId === this._playId) {
      this.isPlaying = false;
    }
  }

  private playUrl (url: string) {
    return new Promise<void>((resolve) => {
      this.audio.src = url;
      this.audio.oncanplay = async () => {
        try {
          await this.audio.play();
        } catch {
          resolve();
        }
      };
      this.audio.onended = () => resolve();
      this.audio.onerror = () => resolve();
      this.audio.onpause = () => resolve();
    });
  }

  public resolveVoice (text: string): string {
    const hasCyrillic = /[\u0400-\u04FF]/.test(text);
    const hasLatin = /[A-Za-z]/.test(text);
    if (hasLatin && !hasCyrillic) {
      return store.state.voiceEn || "john";
    }
    return store.state.voiceRu || "alena";
  }
}
