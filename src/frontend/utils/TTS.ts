import { storageService } from "@/frontend/services/card-storage-service";
import { Card, CardType } from "@/common/interfaces/ConfigFile";
import { tts } from "./TTSServer";
import { Voice } from "@/common/interfaces/Voice";
import axios from "axios";
import store from "@/frontend/store";
import { reactive } from "vue";
import { Telemetry } from "./Telemetry";

type UtteranceMode = "standard" | "direct" | "without-space";
type PlaybackResult = "completed" | "failed" | "cancelled";

export class TTS {
  isPlaying = false;
  audio = new Audio();
  private _finishOperation?: (result: PlaybackResult) => void;
  private _cancelPlayback?: () => void;
  private static _instance?: TTS;
  static get instance(): TTS {
    if (TTS._instance === undefined) {
      TTS._instance = new TTS();
    }
    return TTS._instance;
  }

  static voices: Voice[] = reactive([]);

  private static audioBlob(buffer: Uint8Array): Blob {
    const arrayBuffer = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(arrayBuffer).set(buffer);
    return new Blob([arrayBuffer], { type: "audio/mp3" });
  }

  constructor() {
    this.getVoices();
  }

  private async getVoices() {
    if (TTS.voices.length > 0) return;
    try {
      const { data } = await axios.get<{ id: string; lang_code: string; name: string }[]>(
        "https://tts.linka.su/voices"
      );
      TTS.voices.push(
        ...data.map((v) => ({
          value: v.id,
          text: v.name + " (" + v.lang_code + ")",
          langCode: v.lang_code
        }))
      );
    } catch (error) {
      console.warn("Failed to load TTS voices", error);
    }
  }

  public async playCards(file: string, cards: Card[], force = false, mode?: UtteranceMode) {
    if (!cards.some((card) => card.cardType === CardType.AudioCard)) return;
    await this.playOperation(
      async (active) => {
        let result: PlaybackResult = "completed";
        for (const card of cards) {
          if (!active()) return "cancelled";
          if (card.cardType === CardType.AudioCard) {
            if (!card.audioPath) {
              result = "failed";
              continue;
            }
            const buffer = await storageService.getAudio(file, card.audioPath);
            if (!active()) return "cancelled";
            if (!buffer) {
              result = "failed";
              continue;
            }
            const url = URL.createObjectURL(TTS.audioBlob(buffer));
            try {
              const played = await this.playUrl(url);
              if (played === "cancelled") return played;
              if (played === "failed") result = "failed";
            } finally {
              URL.revokeObjectURL(url);
            }
          }
        }
        return result;
      },
      force,
      mode
    );
  }

  public async playText(text: string, voice?: string, mode?: UtteranceMode): Promise<void> {
    if (!text) return;
    await this.playOperation(
      async (active) => {
        const buffer = await tts(text, voice ?? this.resolveVoice(text));
        if (!active()) return "cancelled";
        const url = URL.createObjectURL(TTS.audioBlob(buffer));
        try {
          return await this.playUrl(url);
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      false,
      mode
    );
  }

  public stop(): void {
    this._finishOperation?.("cancelled");
    this._cancelPlayback?.();
    this.audio.pause();
    this.audio.currentTime = 0;
    // Queued events from interrupted audio must not reach its replacement's callbacks.
    this.audio = new Audio();
    this.isPlaying = false;
  }

  public async forcePlayText(text: string, voice?: string): Promise<void> {
    this.stop();
    await this.playText(text, voice);
  }

  private async playOperation(
    play: (active: () => boolean) => Promise<PlaybackResult>,
    force: boolean,
    mode?: UtteranceMode
  ): Promise<void> {
    if (this.isPlaying) {
      this.stop();
      if (!force) return;
    }
    this.isPlaying = true;
    const active = () => this._finishOperation === finish;
    const finish = (result: PlaybackResult) => {
      if (!active()) return;
      this._finishOperation = undefined;
      this.isPlaying = false;
      if (mode) Telemetry.outcome({ kind: "utterance_completed", result, mode });
    };
    this._finishOperation = finish;
    try {
      finish(await play(active));
    } catch (error) {
      finish("failed");
      throw error;
    }
  }

  private playUrl(url: string) {
    return new Promise<PlaybackResult>((resolve) => {
      let settled = false;
      let started = false;
      const cancel = () => finish("cancelled");
      const finish = (result: PlaybackResult) => {
        if (settled) return;
        settled = true;
        this.audio.oncanplay = null;
        this.audio.onended = null;
        this.audio.onerror = null;
        this.audio.onpause = null;
        if (this._cancelPlayback === cancel) this._cancelPlayback = undefined;
        resolve(result);
      };
      this._cancelPlayback = cancel;
      this.audio.src = url;
      this.audio.oncanplay = async () => {
        if (settled || started) return;
        started = true;
        try {
          await this.audio.play();
        } catch {
          finish("failed");
        }
      };
      this.audio.onended = () => finish("completed");
      this.audio.onerror = () => finish("failed");
      this.audio.onpause = () => {
        // Natural completion can dispatch pause before ended; only ended proves success.
        if (!this.audio.ended) finish("cancelled");
      };
    });
  }

  public resolveVoice(text: string): string {
    const hasCyrillic = /[\u0400-\u04FF]/.test(text);
    const hasLatin = /[A-Za-z]/.test(text);
    if (hasLatin && !hasCyrillic) {
      return store.state.voiceEn || "john";
    }
    return store.state.voiceRu || "alena";
  }
}
