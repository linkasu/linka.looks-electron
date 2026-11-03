import { describe, it, expect } from "vitest";
import { EyeTyping } from "@/frontend/utils/eyeTyping";

describe("eye typing edits", () => {
  for (const language of ["ru", "en"] as const) {
    it(`offers only digits, * and № in the ${language} numpad and undoes their insertion`, () => {
      const model = new EyeTyping({ text: "а🙂b", caret: 2 });
      model.language = language;
      model.show("numbers");
      expect(model.rows.map((row) => row.join(""))).toEqual(["123*", "456№", "7890"]);
      model.insert("*");
      model.insert("№");
      expect(model.draft).toEqual({ text: "а🙂*№b", caret: 4 });
      for (const screen of ["symbols", "cursor", "letters", "numbers"] as const) {
        model.show(screen);
        expect(model.draft).toEqual({ text: "а🙂*№b", caret: 4 });
      }
      model.undo();
      expect(model.draft).toEqual({ text: "а🙂*b", caret: 3 });
      model.undo();
      expect(model.draft).toEqual({ text: "а🙂b", caret: 2 });
    });
  }

  it("undoes completion and its automatic space as one edit", () => {
    const model = new EyeTyping({ text: "я при", caret: 5 });
    model.accept({ text: "я привет ", caret: 9 });
    expect(model.draft).toEqual({ text: "я привет ", caret: 9 });
    model.undo();
    expect(model.draft).toEqual({ text: "я при", caret: 5 });
  });

  it("accepts a prefix edit preserving the mid-word suffix", () => {
    const model = new EyeTyping({ text: "я привт друг", caret: 5 });
    model.accept({ text: "я приветвт друг", caret: 8 });
    expect(model.draft).toEqual({ text: "я приветвт друг", caret: 8 });
    model.undo();
    expect(model.draft).toEqual({ text: "я привт друг", caret: 5 });
  });

  it("clears immediately and restores all text and caret with one undo", () => {
    const model = new EyeTyping({ text: "текст\nhello", caret: 3 });
    model.clear();
    expect(model.draft).toEqual({ text: "", caret: 0 });
    model.clear();
    model.undo();
    expect(model.draft).toEqual({ text: "текст\nhello", caret: 3 });
  });

  it("moves past an already completed word without creating a spurious undo edit", () => {
    const model = new EyeTyping({ text: "привет мир", caret: 3 });
    model.accept({ text: "привет мир", caret: 7 });
    expect(model.draft).toEqual({ text: "привет мир", caret: 7 });
    expect(model.history).toHaveLength(0);
  });

  it("keeps numbers and signs selected while typing and preserves caret across screens", () => {
    const model = new EyeTyping({ text: "аб", caret: 1 });
    for (const screen of ["numbers", "symbols", "cursor", "letters"] as const) {
      model.show(screen);
      expect(model.draft.caret).toBe(1);
      expect(model.draft.text).toBe("аб");
    }
    model.show("numbers");
    model.insert("1");
    expect(model.screen).toBe("numbers");
    model.show("symbols");
    model.insert("!");
    expect(model.screen).toBe("symbols");
    expect(model.draft.text).toBe("а1!б");
  });

  it("offers all RU/EN letters and does not predict in EN", () => {
    const model = new EyeTyping();
    expect(model.rows.map((row) => row.join(""))).toEqual([
      "ёйцукенгшщзхъ",
      "фывапролджэ",
      "ячсмитьбю"
    ]);
    expect(new Set(model.alphabet).size).toBe(33);
    model.language = "en";
    expect(model.rows.map((row) => row.join(""))).toEqual(["qwertyuiop", "asdfghjkl", "zxcvbnm"]);
    expect(new Set(model.alphabet).size).toBe(26);
    model.insert("hello");
    model.accept({ text: "привет ", caret: 7 });
    expect(model.draft.text).toBe("hello");
    model.uppercase = true;
    expect(model.alphabet[0]).toBe("Q");
  });

  it("deletes the previous word and trailing spaces atomically, preserving suffix and Unicode", () => {
    const model = new EyeTyping({ text: "я 🙂hello  хвост", caret: 10 });
    model.backspaceWord();
    expect(model.draft).toEqual({ text: "я хвост", caret: 2 });
    model.undo();
    expect(model.draft).toEqual({ text: "я 🙂hello  хвост", caret: 10 });
    model.move(0);
    model.backspaceWord();
    expect(model.history).toHaveLength(0);
  });

  it("navigates words and boundaries and deletes Unicode code points intact", () => {
    const model = new EyeTyping({ text: "привет  мир", caret: 0 });
    model.moveWord(1);
    expect(model.draft.caret).toBe(6);
    model.moveWord(1);
    expect(model.draft.caret).toBe(11);
    model.moveWord(-1);
    expect(model.draft.caret).toBe(8);
    model.moveWord(-1);
    expect(model.draft.caret).toBe(0);
    model.move(-10);
    model.backspace();
    expect(model.history).toHaveLength(0);
    model.insert("🙂");
    model.backspace();
    expect(model.draft.text).toBe("привет  мир");
    model.undo();
    expect(model.draft).toEqual({ text: "🙂привет  мир", caret: 1 });
    model.move(1000);
    expect(model.draft.caret).toBe(12);
  });

  it("rejects invalid predictor output and limits history", () => {
    const model = new EyeTyping();
    model.insert("п");
    for (const caret of [-1, 0.5, 99]) model.accept({ text: "invalid", caret });
    expect(model.draft.text).toBe("п");
    for (let i = 0; i < 110; i++) model.insert("а");
    expect(model.history).toHaveLength(100);
  });
});
