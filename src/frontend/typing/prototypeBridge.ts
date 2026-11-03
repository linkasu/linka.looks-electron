// Throwaway browser-only demo: no disk, IPC, network, tracker or actual speech.
if (import.meta.env.DEV && !window.typingBridge) {
  let draft = { text: "Привет! Hello! ", caret: 15 };
  let finishSpeech: (() => void) | undefined;
  window.typingBridge = {
    load: () => draft,
    save: (value) => {
      draft = value;
    },
    settings: () => ({
      button: {
        enabled: true,
        borders: 1,
        timeout: 1000,
        dwellIndicator: "circle",
        clickSound: false,
        eyeSelect: true,
        eyeActivation: true,
        keyboardActivation: true,
        joystickActivation: true,
        animation: true
      },
      keyMapping: { enter: ["Enter"] }
    }),
    predict: async (_id, input) => {
      const prefix = input.text.slice(0, input.caret).match(/[а-яё]+$/iu)?.[0] || "";
      // Synthetic examples compare geometry only; they are not predictor quality evidence.
      return ["привет", "пример", "принято"].map((word) => {
        const text =
          input.text.slice(0, input.caret - prefix.length) +
          word +
          " " +
          input.text.slice(input.caret);
        return {
          word,
          draft: {
            text,
            caret: Array.from(input.text.slice(0, input.caret - prefix.length) + word + " ").length
          }
        };
      });
    },
    cancel: () => {},
    bounds: () => {},
    onEye: () => () => {},
    close: () => {},
    speak: () =>
      new Promise<void>((resolve) => {
        finishSpeech = resolve;
      }),
    stop: () => finishSpeech?.()
  };
}
