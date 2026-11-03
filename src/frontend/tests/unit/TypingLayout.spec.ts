import { describe, expect, it, vi } from "vitest";
import { normalizeTypingLayout } from "@/common/typingLayout";

describe("persistent keyboard layout", () => {
  it.each(["A", "B", "C"])("saves %s and restores it in a fresh store", async (layout) => {
    vi.resetModules();
    const { default: store } = await import("@/frontend/store");
    store.commit("typingLayout", layout);
    const { eStore } = await import("@/frontend/store/eStore");
    expect(eStore.get("typingLayout")).toBe("C");
    vi.resetModules();
    const fresh = (await import("@/frontend/store")).default;
    expect(fresh.state.typingLayout).toBe("C");
  });

  it.each([undefined, null, "A", "B", "D", {}, 1])(
    "migrates %s on read without changing draft/caret or the rollback preference",
    async (value) => {
      expect(normalizeTypingLayout(value)).toBe("C");
      vi.resetModules();
      const { eStore } = await import("@/frontend/store/eStore");
      eStore.set("typingLayout", value);
      eStore.set("eyeTypingDraftV1", { text: "привет", caret: 3 });
      const store = (await import("@/frontend/store")).default;
      expect(store.state.typingLayout).toBe("C");
      expect(eStore.get("typingLayout")).toEqual(value);
      store.commit("typingLayout", "B");
      expect(eStore.get("eyeTypingDraftV1")).toEqual({ text: "привет", caret: 3 });
    }
  );

  it("does not claim a new selection when persistence fails", async () => {
    vi.resetModules();
    const store = (await import("@/frontend/store")).default;
    const { eStore } = await import("@/frontend/store/eStore");
    store.commit("typingLayout", "B");
    vi.mocked(eStore.set).mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    expect(() => store.commit("typingLayout", "C")).toThrow("disk full");
    expect(store.state.typingLayout).toBe("C");
    expect(eStore.get("typingLayout")).toBe("C");
  });
});
