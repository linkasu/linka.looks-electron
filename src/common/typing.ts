export interface TypingInput {
  text: string;
  caret: number;
  language: "ru" | "en";
}

export interface TypingEdit {
  word: string;
  draft: { text: string; caret: number };
}

export interface TypingBridge {
  load(): { text: string; caret: number };
  save(draft: { text: string; caret: number }): void;
  predict(id: number, input: TypingInput): Promise<TypingEdit[]>;
  cancel(id: number): void;
  settings(): {
    typingLayout?: import("./typingLayout").TypingLayout;
    button: EyeTargetSettings & {
      borders: number;
      clickSound: boolean;
      dwellIndicator: string;
      animation: boolean;
    };
    keyMapping: EyeTargetKeyMapping;
  };
  bounds(data: unknown): void;
  onEye(channel: string, listener: (data: unknown) => void): () => void;
  speak(text: string): Promise<void>;
  stop(): void;
  close(): void;
}

declare global {
  interface Window {
    typingBridge: TypingBridge;
  }
}
import type { EyeTargetKeyMapping, EyeTargetSettings } from "@linkasu/tobii-electron/types";
