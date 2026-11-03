import type { TypingInput, TypingEdit } from "@/common/typing";

export interface TypingPredictor {
  suggest(input: TypingInput, signal: AbortSignal): Promise<readonly TypingEdit[]>;
}

let request = 0;
export const typingPredictor: TypingPredictor = {
  async suggest(input, signal) {
    const id = ++request;
    if (signal.aborted) return [];
    const abort = () => window.typingBridge.cancel(id);
    signal.addEventListener("abort", abort, { once: true });
    try {
      return await window.typingBridge.predict(id, input);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
};
