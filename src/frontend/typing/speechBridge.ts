export const TTS = {
  instance: {
    playText: (text: string) => window.typingBridge.speak(text),
    stop: () => window.typingBridge.stop()
  }
};
