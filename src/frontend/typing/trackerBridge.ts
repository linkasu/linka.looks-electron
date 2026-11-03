const subscriptions = new Map<(...args: unknown[]) => void, () => void>();

export const ipcRenderer = {
  send(channel: string, data: unknown) {
    if (channel === "typing:cancel" && typeof data === "number") {
      window.typingBridge.cancel(data);
      return;
    }
    if (channel !== "eye-elements") throw new Error("INVALID_CHANNEL");
    window.typingBridge.bounds(data);
  },
  async invoke(channel: string, id?: number, input?: TypingInput) {
    if (channel === "typing:release") return { ok: true };
    if (channel === "typing:predict" && id !== undefined && input)
      return { ok: true, value: await window.typingBridge.predict(id, input) };
    throw new Error("INVALID_CHANNEL");
  },
  on(channel: string, listener: (...args: unknown[]) => void) {
    subscriptions.set(
      listener,
      window.typingBridge.onEye(channel, (data) => listener(undefined, data))
    );
  },
  off(_channel: string, listener: (...args: unknown[]) => void) {
    subscriptions.get(listener)?.();
    subscriptions.delete(listener);
  },
  removeListener(channel: string, listener: (...args: unknown[]) => void) {
    this.off(channel, listener);
  }
};
import type { TypingInput } from "../../common/typing";
