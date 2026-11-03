import { describe, it, expect } from "vitest";
import { eStore } from "@/frontend/store/eStore";
import { loadTypingDraft, saveTypingDraft } from "@/frontend/services/typingDraft";

describe("typing draft persistence", () => {
  it("loads an empty draft without changing an unrelated setting", () => {
    eStore.set("voiceRu", "alena");
    expect(loadTypingDraft()).toEqual({ text: "", caret: 0 });
    expect(eStore.get("voiceRu")).toBe("alena");
  });

  it("persists text and caret together for a fresh view/restart", () => {
    saveTypingDraft({ text: "привет\nhello🙂", caret: 4 });
    expect(eStore.set).toHaveBeenCalledWith("eyeTypingDraftV1", {
      text: "привет\nhello🙂",
      caret: 4
    });
    expect(loadTypingDraft()).toEqual({ text: "привет\nhello🙂", caret: 4 });
  });

  it("validates stored data and clamps caret without rewriting the record", () => {
    for (const value of [null, "text", {}, { text: 123, caret: 0 }, { text: "a", caret: 0.5 }]) {
      eStore.set("eyeTypingDraftV1", value);
      expect(loadTypingDraft()).toEqual({ text: "", caret: 0 });
    }
    eStore.set("eyeTypingDraftV1", { text: "🙂а", caret: 999 });
    expect(loadTypingDraft()).toEqual({ text: "🙂а", caret: 2 });
    eStore.set("eyeTypingDraftV1", { text: "а", caret: -1 });
    expect(loadTypingDraft()).toEqual({ text: "а", caret: 0 });
  });
});
