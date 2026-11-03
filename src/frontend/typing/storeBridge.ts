export const eStore = {
  get(key: string) {
    if (key !== "eyeTypingDraftV1") throw new Error("INVALID_KEY");
    return window.typingBridge.load();
  },
  set(key: string, draft: { text: string; caret: number }) {
    if (key !== "eyeTypingDraftV1") throw new Error("INVALID_KEY");
    window.typingBridge.save(draft);
  }
};
