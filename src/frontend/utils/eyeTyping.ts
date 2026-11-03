export type TypingLanguage = "ru" | "en";
export type TypingScreen = "letters" | "numbers" | "symbols" | "cursor";
export interface TypingDraft {
  text: string;
  caret: number;
}

export class EyeTyping {
  draft: TypingDraft;
  history: TypingDraft[] = [];
  language: TypingLanguage = "ru";
  screen: TypingScreen = "letters";
  uppercase = false;

  constructor(draft: TypingDraft = { text: "", caret: 0 }) {
    this.draft = { ...draft };
  }

  get characters() {
    return Array.from(this.draft.text);
  }

  get rows() {
    const rows = {
      letters:
        this.language === "ru"
          ? ["ёйцукенгшщзхъ", "фывапролджэ", "ячсмитьбю"]
          : ["qwertyuiop", "asdfghjkl", "zxcvbnm"],
      numbers: ["123*", "456№", "7890"],
      symbols: [".,!?;:—", "-()\"'«»", "/@#%+*=\n"],
      cursor: []
    }[this.screen];
    return rows.map((row) => Array.from(this.uppercase ? row.toUpperCase() : row));
  }

  get alphabet() {
    return this.rows.flat();
  }

  show(screen: TypingScreen) {
    this.screen = screen;
  }

  move(caret: number) {
    this.draft = { ...this.draft, caret: Math.max(0, Math.min(caret, this.characters.length)) };
  }

  moveWord(direction: -1 | 1) {
    this.move(this.wordBoundary(direction));
  }

  private wordBoundary(direction: -1 | 1) {
    const chars = this.characters;
    let caret = this.draft.caret;
    const offset = direction === -1 ? -1 : 0;
    while (chars[caret + offset] !== undefined && /\s/u.test(chars[caret + offset]))
      caret += direction;
    while (chars[caret + offset] !== undefined && !/\s/u.test(chars[caret + offset]))
      caret += direction;
    return caret;
  }

  private replace(start: number, end: number, text: string) {
    const chars = this.characters;
    const next = chars.slice(0, start).join("") + text + chars.slice(end).join("");
    if (next === this.draft.text) {
      this.move(start + Array.from(text).length);
      return;
    }
    this.history.push({ ...this.draft });
    // shortcut: keep the latest 100 edits in memory; add a larger history only if needed.
    if (this.history.length > 100) this.history.shift();
    this.draft = { text: next, caret: start + Array.from(text).length };
  }

  insert(text: string) {
    this.replace(this.draft.caret, this.draft.caret, text);
  }

  backspace() {
    if (this.draft.caret) this.replace(this.draft.caret - 1, this.draft.caret, "");
  }

  backspaceWord() {
    this.replace(this.wordBoundary(-1), this.draft.caret, "");
  }

  clear() {
    this.replace(0, this.characters.length, "");
  }

  undo() {
    const previous = this.history.pop();
    if (previous) this.draft = previous;
  }

  accept(draft: TypingDraft) {
    if (
      this.language !== "ru" ||
      !Number.isSafeInteger(draft.caret) ||
      draft.caret < 0 ||
      draft.caret > Array.from(draft.text).length
    )
      return;
    if (draft.text === this.draft.text) {
      this.move(draft.caret);
      return;
    }
    this.history.push({ ...this.draft });
    if (this.history.length > 100) this.history.shift();
    this.draft = { ...draft };
  }

  get wordRange() {
    const chars = this.characters;
    let start = this.draft.caret;
    let end = start;
    while (start > 0 && /\p{L}/u.test(chars[start - 1])) start--;
    while (end < chars.length && /\p{L}/u.test(chars[end])) end++;
    return { start, end, prefix: chars.slice(start, this.draft.caret).join("") };
  }
}
