import { eStore } from "@/frontend/store/eStore";
import type { TypingDraft } from "@/frontend/utils/eyeTyping";

const key = "eyeTypingDraftV1";

export function loadTypingDraft(): TypingDraft {
  const value: unknown = eStore.get(key);
  if (
    typeof value !== "object" ||
    value === null ||
    !("text" in value) ||
    typeof value.text !== "string" ||
    !("caret" in value) ||
    typeof value.caret !== "number" ||
    !Number.isInteger(value.caret)
  ) {
    return { text: "", caret: 0 };
  }
  return {
    text: value.text,
    caret: Math.max(0, Math.min(value.caret, Array.from(value.text).length))
  };
}

export function saveTypingDraft(draft: TypingDraft) {
  if (
    typeof draft.text !== "string" ||
    draft.text.length > 1024 * 1024 ||
    !Number.isSafeInteger(draft.caret) ||
    draft.caret < 0 ||
    draft.caret > Array.from(draft.text).length
  )
    throw new Error("Invalid typing draft");
  eStore.set(key, { text: draft.text, caret: draft.caret });
}
