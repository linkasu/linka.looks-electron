import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  Predictor,
  applySuggestion
} from "../../../../vendor/predictor/packages/electron/src/index";
import { TypingSession } from "../../services/typingSession";
import { EyeTyping } from "../../../frontend/utils/eyeTyping";

const executablePath = resolve(
  "predictor-resources",
  process.platform === "win32" ? "lp-electron.exe" : "lp-electron"
);
const modelPath = resolve("predictor-resources/model.lpk");

describe.skipIf(!existsSync(executablePath) || !existsSync(modelPath))(
  "real Rust keyboard integration (tiny model)",
  () => {
    it.each([
      ["", "хо", ""],
      ["я ", "хо", ""],
      ["я  ", "хо", ""],
      ["я   ", "хо", "  хвост"],
      ["я\t", "хо", "\tхвост"],
      ["я\n", "хо", "\nхвост"],
      ["я, ", "хо", ", мир!"],
      ["(я)—", "хо", ")"],
      ["hello ", "хо", " world"],
      ["😀 ", "хо", "😀"],
      ["👩‍👩‍👧‍👦 ", "хо", "!"],
      ["е\u0308! ", "хо", ""],
      ["𐐀! ", "хо", "𐐀"],
      ["", "хо", "вост"],
      ["я ", "хо", "чу"],
      ["я ", "хо", "\u0308!"],
      ["я ", "хо", " хвост"],
      ["я ", "хо", "!"],
      ["я\u00a0", "хо", ""],
      ["я ", "х", ""]
    ])("preserves exact context/suffix and Undo: %j + %j | %j", async (context, prefix, suffix) => {
      const session = new TypingSession(new Predictor({ executablePath, modelPath }));
      const text = context + prefix + suffix;
      const caret = (context + prefix).length;
      const draft = { text, caret: Array.from(context + prefix).length };
      try {
        const edits = await session.predict(1, { text, caret, language: "ru" });
        expect(edits.length).toBeGreaterThan(0);
        expect(edits.length).toBeLessThanOrEqual(3);
        for (const edit of edits) {
          expect(edit.draft.text).toBe(context + edit.word + (suffix || " "));
          expect(edit.draft.caret).toBe(
            Array.from(context + edit.word).length + (!suffix || suffix.startsWith(" ") ? 1 : 0)
          );
          const keyboard = new EyeTyping(draft);
          keyboard.accept(edit.draft);
          expect(keyboard.draft.text.startsWith(context)).toBe(true);
          keyboard.undo();
          expect(keyboard.draft).toEqual(draft);
        }
      } finally {
        await session.dispose();
      }
    });

    it("does not invent a suggestion when tiny returns only context-changing edits at a complete word", async () => {
      const session = new TypingSession(new Predictor({ executablePath, modelPath }));
      try {
        expect(await session.predict(1, { text: "я хочу", caret: 6, language: "ru" })).toEqual([]);
      } finally {
        await session.dispose();
      }
    });

    it.each([
      ["хо хвост", 0],
      ["я хо", 2],
      ["я  хо", 3],
      ["я хо!", 5],
      ["е\u0308", 2],
      ["", 0]
    ])("has no selectable result without a letter prefix: %j @ %i", async (text, caret) => {
      const session = new TypingSession(new Predictor({ executablePath, modelPath }));
      try {
        expect(await session.predict(1, { text, caret, language: "ru" })).toEqual([]);
      } finally {
        await session.dispose();
      }
    });

    it("preserves previous words when a shared projected range includes context", async () => {
      const predictor = new Predictor({ executablePath, modelPath });
      const session = new TypingSession(predictor);
      const input = { text: "я хо", caret: 4, language: "ru" as const };
      try {
        const raw = await predictor.predict(input);
        expect(raw.pos).toBe(-4);
        expect(raw.text).toContain("я хочу");
        expect(raw.text).toContain("хочу");
        const edits = await session.predict(1, input);
        expect(edits.map((edit) => edit.word)).toContain("хочу");
        expect(edits.length).toBeGreaterThan(0);
        for (const edit of edits) {
          expect(edit.draft.text).toBe(`я ${edit.word} `);
          const keyboard = new EyeTyping({ text: input.text, caret: 4 });
          keyboard.accept(edit.draft);
          expect(keyboard.draft.text.startsWith("я ")).toBe(true);
          expect(keyboard.history).toHaveLength(1);
          keyboard.undo();
          expect(keyboard.draft).toEqual({ text: input.text, caret: 4 });
        }
      } finally {
        await session.dispose();
      }
    });

    it("converts UTF16 edits to draft code points, preserves a suffix and undoes atomically", async () => {
      const session = new TypingSession(new Predictor({ executablePath, modelPath }));
      try {
        const text = "😀 хо суффикс😀";
        const edits = await session.predict(1, { text, caret: "😀 хо".length, language: "ru" });
        expect(edits.length).toBeGreaterThan(0);
        for (const edit of edits) {
          expect(edit.draft.text).toBe(`😀 ${edit.word} суффикс😀`);
          expect(edit.draft.caret).toBe(Array.from(`😀 ${edit.word} `).length);
        }
        const keyboard = new EyeTyping({ text, caret: Array.from("😀 хо").length });
        keyboard.accept(edits[0].draft);
        keyboard.undo();
        expect(keyboard.draft).toEqual({ text, caret: Array.from("😀 хо").length });
        const middle = await session.predict(2, {
          text: "😀 ховост",
          caret: "😀 хо".length,
          language: "ru"
        });
        expect(middle[0].draft.text).toBe(`😀 ${middle[0].word}вост`);
        expect(middle[0].draft.caret).toBe(Array.from(`😀 ${middle[0].word}`).length);
        const end = await session.predict(3, { text: "хо", caret: 2, language: "ru" });
        expect(end[0].draft.text).toBe(end[0].word + " ");
      } finally {
        await session.dispose();
      }
    });

    it("cancels owned work, rejects replayed IDs and lets later input recover", async () => {
      const session = new TypingSession(new Predictor({ executablePath, modelPath }));
      const input = { text: "хо", caret: 2, language: "ru" as const };
      try {
        const pending = session.predict(1, input);
        session.cancel(1);
        await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
        await expect(session.predict(1, input)).rejects.toThrow("INVALID_REQUEST");
        expect((await session.predict(2, input)).length).toBeGreaterThan(0);
      } finally {
        await session.dispose();
      }
    });
  }
);

it.each([
  {
    text: "я хо",
    caret: 4,
    pos: -4,
    candidates: ["хочу", "я хочу", "я хочешь"],
    words: ["хочу", "хочешь"]
  },
  {
    text: "я  хо!",
    caret: 5,
    pos: -5,
    candidates: ["я хочу", "я  хочу", "яхочу"],
    words: ["хочу"]
  },
  { text: "hello хо", caret: 8, pos: -8, candidates: ["hello хочу", "хочу"], words: ["хочу"] },
  { text: "я хо", caret: 4, pos: -1, candidates: ["очу"], words: ["хочу"] },
  { text: "я хо", caret: 4, pos: 0, candidates: ["чу"], words: ["хочу"] },
  {
    text: "я хо",
    caret: 4,
    pos: -4,
    candidates: ["хочу", "я хочу", "я хочешь", "я хорошо", "я хотел"],
    words: ["хочу", "хочешь", "хорошо"]
  },
  {
    text: "е\u0308 хо",
    caret: 5,
    pos: -5,
    candidates: ["ё хочу", "е\u0308 хочу"],
    words: ["хочу"]
  },
  { text: "👩‍👩‍👧‍👦 хо", caret: 14, pos: -3, candidates: ["хочу", " хочу"], words: ["хочу"] },
  {
    text: "я хо",
    caret: 4,
    pos: -4,
    candidates: ["я хочу бы", "я хочу!", "я hello", "я хочу"],
    words: ["хочу"]
  }
])(
  "guards adversarial library projections: $text / $pos",
  async ({ text, caret, pos, candidates, words }) => {
    const predictor = new Predictor({
      executablePath: resolve("unused"),
      modelPath: resolve("unused")
    });
    const input = { text, caret, language: "ru" as const };
    // Protocol double only: inference is covered separately with the real tiny sidecar.
    vi.spyOn(predictor, "predict").mockResolvedValue({
      input,
      pos,
      text: candidates,
      endOfWord: true
    });
    const session = new TypingSession(predictor);
    try {
      const edits = await session.predict(1, input);
      expect(edits.map((edit) => edit.word)).toEqual(words);
      const start = caret - (text.slice(0, caret).match(/\p{L}+$/u)?.[0].length ?? 0);
      for (const edit of edits) {
        expect(edit.draft.text.startsWith(text.slice(0, start))).toBe(true);
        expect(edit.draft.text).toBe(text.slice(0, start) + edit.word + (text.slice(caret) || " "));
      }
    } finally {
      await session.dispose();
    }
  }
);

it("library contract rejects stale snapshots and surrogate-splitting replacement ranges", () => {
  const input = { text: "😀хо!", caret: 4, language: "ru" as const };
  const result = { input, text: ["хочу"], pos: -2, endOfWord: true };
  expect(applySuggestion(input, result, 0)).toEqual({ ...input, text: "😀хочу!", caret: 6 });
  for (const current of [
    { ...input, text: "😀ха!" },
    { ...input, caret: 3 },
    { ...input, language: "en" as const }
  ])
    expect(() => applySuggestion(current, result, 0)).toThrow("STALE");
  expect(() => applySuggestion(input, { ...result, pos: -3 }, 0)).toThrow("INVALID_INPUT");
});

it.each([
  { text: "😀хо", caret: 1 },
  { text: "\uD800хо", caret: 3 },
  { text: "хо\uDC00", caret: 2 }
])("rejects invalid UTF16 input before spawning: %j", async (draft) => {
  const session = new TypingSession(
    new Predictor({ executablePath: resolve("unused"), modelPath: resolve("unused") })
  );
  try {
    await expect(session.predict(1, { ...draft, language: "ru" })).rejects.toMatchObject({
      code: "INVALID_INPUT"
    });
  } finally {
    await session.dispose();
  }
});

it("rejects oversized RU byte prefixes before spawning while retaining manual EN", async () => {
  const predictor = new Predictor({
    executablePath: resolve("unused-executable"),
    modelPath: resolve("unused-model")
  });
  const text = "я".repeat(8193);
  try {
    await expect(
      predictor.predict({ text, caret: text.length, language: "ru" })
    ).rejects.toMatchObject({
      code: "INVALID_INPUT"
    });
    expect((await predictor.predict({ text, caret: text.length, language: "en" })).text).toEqual(
      []
    );
  } finally {
    await predictor.dispose();
  }
});

it("EN needs neither a model nor an executable", async () => {
  const session = new TypingSession(
    new Predictor({
      executablePath: resolve("missing-sidecar"),
      modelPath: resolve("missing-model")
    })
  );
  try {
    expect(await session.predict(1, { text: "hello😀", caret: 5, language: "en" })).toEqual([]);
  } finally {
    await session.dispose();
  }
});
