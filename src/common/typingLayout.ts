export type TypingLayout = "C";

export function normalizeTypingLayout(_value: unknown): TypingLayout {
  // Read-time migration keeps legacy preferences rollback-safe and never touches the draft.
  return "C";
}
