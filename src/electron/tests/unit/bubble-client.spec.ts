import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BubbleClient, bubbleInstallationId, openBubbleSettings } from "../../bubble/client";
import { EventEmitter } from "node:events";
import { serveBubbleControl } from "../../bubble/controlChannel";
import { BubbleController } from "../../bubble/controller";
import { DEFAULT_BUBBLE_PREFERENCES } from "../../../common/bubble/contract";

vi.mock("electron", () => ({ app: { getAppPath: () => "/fixture/dist-electron" }, ipcMain: {} }));
const childProcess = vi.hoisted(() => ({ spawn: vi.fn() }));
const files = vi.hoisted(() => ({ existsSync: vi.fn(() => false) }));
vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  existsSync: files.existsSync
}));
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  childProcess.spawn.mockImplementation(actual.spawn);
  return { ...actual, spawn: childProcess.spawn };
});

describe("Bubble client lifetime", () => {
  it("reuses the actual development entry file, not its package directory", () => {
    const original = process.argv[1];
    const entry = "/fixture/dist-electron/main.js";
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    childProcess.spawn.mockReturnValueOnce(child);
    process.argv[1] = "-r";
    try {
      openBubbleSettings();
      expect(childProcess.spawn).toHaveBeenLastCalledWith(
        process.execPath,
        [entry, "--bubble-settings"],
        expect.objectContaining({ detached: true, stdio: "ignore" })
      );
    } finally {
      process.argv[1] = original;
    }
  });
  it("preserves a development package root when it contains the app manifest", () => {
    files.existsSync.mockReturnValueOnce(true);
    childProcess.spawn.mockReturnValueOnce(Object.assign(new EventEmitter(), { unref: vi.fn() }));
    openBubbleSettings();
    expect(childProcess.spawn).toHaveBeenLastCalledWith(
      process.execPath,
      ["/fixture/dist-electron", "--bubble-settings"],
      expect.objectContaining({ detached: true })
    );
  });
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
