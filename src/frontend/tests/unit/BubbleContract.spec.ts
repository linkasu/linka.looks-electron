import { describe, expect, it } from "vitest";
import { DEFAULT_BUBBLE_PREFERENCES, validPreferencePatch } from "@/common/bubble/contract";

describe("Bubble preferences", () => {
  it("starts hidden and validates only explicitly supported settings", () => {
    expect(DEFAULT_BUBBLE_PREFERENCES.enabled).toBe(false);
    expect(validPreferencePatch(DEFAULT_BUBBLE_PREFERENCES)).toBe(true);
    for (const value of [
      null,
      [],
      {},
      { enabled: 1 },
      { diameter: 19 },
      { brightness: 101 },
      { smoothness: NaN },
      { diameter: 44.5 },
      { executable: "other.exe" }
    ]) {
      expect(validPreferencePatch(value)).toBe(false);
    }
    expect(validPreferencePatch({ enabled: true, smoothness: 0 })).toBe(true);
  });
});
