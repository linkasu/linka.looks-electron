import { Predictor, applySuggestion } from "../../../vendor/predictor/packages/electron/src/index";
import type { TypingInput, TypingEdit } from "../../common/typing";

export class TypingSession {
  private pending?: { id: number; controller: AbortController };
  private latest = 0;

  constructor(private readonly predictor: Predictor) {}

  cancel(id?: number) {
    if (id === undefined || this.pending?.id === id) this.pending?.controller.abort();
  }

  async predict(id: number, input: TypingInput): Promise<TypingEdit[]> {
    if (!Number.isSafeInteger(id) || id <= this.latest) throw new Error("INVALID_REQUEST");
    this.latest = id;
    this.cancel();
    const controller = new AbortController();
    this.pending = { id, controller };
    try {
      const result = await this.predictor.predict(input, { signal: controller.signal });
      const prefix = input.text.slice(0, input.caret).match(/\p{L}+$/u)?.[0];
      if (!prefix) return [];
      const start = input.caret - prefix.length;
      const context = input.text.slice(0, start);
      return result.text
        .flatMap((_, index) => {
          const edit = applySuggestion(input, result, index);
          const word = edit.text.slice(start, edit.caret);
          // A shared projected tail may include context; never expose edits that change it.
          if (edit.caret < start || !edit.text.startsWith(context) || !/^[а-яё]+$/iu.test(word))
            return [];
          // Preserve a mid-word suffix verbatim; only add a space at the text end.
          if (input.caret === input.text.length) {
            edit.text += " ";
            edit.caret++;
          } else if (edit.text[edit.caret] === " ") edit.caret++;
          return [
            {
              word,
              draft: { text: edit.text, caret: Array.from(edit.text.slice(0, edit.caret)).length }
            }
          ];
        })
        .slice(0, 3);
    } finally {
      if (this.pending?.id === id) this.pending = undefined;
    }
  }

  async dispose() {
    this.cancel();
    await this.predictor.dispose();
  }
}
