const subscriptions = new Map<(...args: unknown[]) => void, () => void>();

export const ipcRenderer = {
  send(channel: string, data: unknown) {
    if (channel !== "eye-elements") throw new Error("INVALID_CHANNEL");
    window.typingBridge.bounds(data);
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
