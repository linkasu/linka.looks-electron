import { describe, expect, it, vi } from "vitest";
import { BubbleController } from "../../bubble/controller";
import { DEFAULT_BUBBLE_PREFERENCES } from "../../../common/bubble/contract";

describe("Bubble single writer", () => {
  function setup() {
    const store = {
      load: vi.fn(async () => ({ ...DEFAULT_BUBBLE_PREFERENCES })),
      save: vi.fn(async () => {})
    };
    const apply = vi.fn();
    return { store, apply, controller: new BubbleController(store, apply) };
  }

  it("serializes tray and settings, rejecting a stale snapshot without overwriting it", async () => {
    const { controller, store } = setup();
    await controller.initialize();
    const original = controller.snapshot();
    const tray = controller.change({ ...original, patch: { enabled: true } });
    const settings = controller.change({ ...original, patch: { brightness: 80 } });
    expect((await tray).ok).toBe(true);
    expect((await settings).code).toBe("CONFLICT");
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().preferences).toEqual({
      ...DEFAULT_BUBBLE_PREFERENCES,
      enabled: true
    });
  });

  it("keeps persisted choice independent of data loss and session exit", async () => {
    const { controller } = setup();
    await controller.initialize();
    await controller.change({ ...controller.snapshot(), patch: { enabled: true } });
    controller.runtime("stale", false);
    await controller.stop();
    expect(controller.snapshot().preferences.enabled).toBe(true);
    expect(
      (await controller.change({ ...controller.snapshot(), patch: { enabled: false } })).code
    ).toBe("STOPPING");
  });

  it("does not apply a failed write or overwrite unreadable settings", async () => {
    const { controller, store, apply } = setup();
    await controller.initialize();
    store.save.mockRejectedValueOnce(new Error("disk"));
    expect(
      (await controller.change({ ...controller.snapshot(), patch: { enabled: true } })).code
    ).toBe("SAVE_FAILED");
    expect(controller.snapshot().preferences.enabled).toBe(false);
    expect(apply).toHaveBeenCalledTimes(1);
    const broken = setup();
    broken.store.load.mockRejectedValueOnce(new Error("new schema"));
    await broken.controller.initialize();
    expect(
      (
        await broken.controller.change({
          ...broken.controller.snapshot(),
          patch: { enabled: true }
        })
      ).code
    ).toBe("SETTINGS_UNREADABLE");
    expect(broken.store.save).not.toHaveBeenCalled();
  });
});
