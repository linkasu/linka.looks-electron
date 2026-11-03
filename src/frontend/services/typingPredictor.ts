import type { TypingInput, TypingEdit } from "@/common/typing";
import { ipcRenderer } from "electron";

export interface TypingPredictor {
  suggest(input: TypingInput, signal: AbortSignal): Promise<readonly TypingEdit[]>;
}

let request = 0;
export const typingPredictor: TypingPredictor = {
  async suggest(input, signal) {
    const id = ++request;
    if (signal.aborted) return [];
    const abort = () => ipcRenderer.send("typing:cancel", id);
    signal.addEventListener("abort", abort, { once: true });
    try {
      const result = await ipcRenderer.invoke("typing:predict", id, input);
      if (!result.ok) throw new Error(result.code);
      return result.value;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
};

export async function releaseTypingPredictor() {
  await ipcRenderer.invoke("typing:release");
}
