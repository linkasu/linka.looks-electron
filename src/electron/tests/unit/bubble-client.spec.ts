import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BubbleClient, bubbleInstallationId } from "../../bubble/client";
import { serveBubbleControl } from "../../bubble/controlChannel";
import { BubbleController } from "../../bubble/controller";
import { DEFAULT_BUBBLE_PREFERENCES } from "../../../common/bubble/contract";

vi.mock("electron", () => ({ app: { getAppPath: () => "/test/looks" }, ipcMain: {} }));

describe("Bubble client lifetime", () => {
  const cleanup: (() => Promise<unknown> | void)[] = [];
  afterEach(async () => {
    for (const close of cleanup.reverse()) await close();
    cleanup.length = 0;
  });
  it("disconnects without ending the independent session or writing settings", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bubble-client-"));
    cleanup.push(() => rm(directory, { recursive: true, force: true }));
    const save = vi.fn(async () => {});
    const controller = new BubbleController(
      { load: async () => ({ ...DEFAULT_BUBBLE_PREFERENCES, enabled: true }), save },
      () => {}
    );
    await controller.initialize();
    cleanup.push(
      await serveBubbleControl(directory, bubbleInstallationId(), controller, async () => {})
    );
    const first = new BubbleClient(directory, () => {});
    await first.connect(false);
    expect((await first.getState()).state!.preferences.enabled).toBe(true);
    first.dispose();
    const second = new BubbleClient(directory, () => {});
    cleanup.push(() => second.dispose());
    await second.connect(false);
    expect((await second.getState()).state!.instanceId).toBe(controller.snapshot().instanceId);
    expect(save).not.toHaveBeenCalled();
  });
});
