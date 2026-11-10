import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { serveBubbleControl, connectBubbleControl } from "../../bubble/controlChannel";
import { BubbleController } from "../../bubble/controller";
import { DEFAULT_BUBBLE_PREFERENCES } from "../../../common/bubble/contract";

describe("Bubble local control", () => {
  const cleanup: (() => Promise<unknown> | void)[] = [];
  afterEach(async () => {
    for (const close of cleanup.reverse()) await close();
    cleanup.length = 0;
  });
  async function setup() {
    const directory = await mkdtemp(
      join(
        process.platform === "win32" && process.env.APPDATA ? process.env.APPDATA : tmpdir(),
        "bubble-ipc-"
      )
    );
    cleanup.push(() => rm(directory, { recursive: true, force: true }));
    const controller = new BubbleController(
      { load: async () => ({ ...DEFAULT_BUBBLE_PREFERENCES }), save: async () => {} },
      () => {}
    );
    await controller.initialize();
    cleanup.push(await serveBubbleControl(directory, "installation", controller, async () => {}));
    return { directory, controller };
  }
  it("watches and changes one authoritative snapshot", async () => {
    const { directory, controller } = await setup();
    const client = await connectBubbleControl(
      directory,
      "installation",
      () => {},
      () => {}
    );
    cleanup.push(() => client.close());
    const state = (await client.request("watch")).state!;
    const changed = await client.request("change", { ...state, patch: { enabled: true } });
    expect(changed.ok).toBe(true);
    expect(controller.snapshot().preferences.enabled).toBe(true);
    expect((await client.request("change", { ...state, patch: { enabled: false } })).code).toBe(
      "CONFLICT"
    );
  });
  it("refuses another installation and unauthenticated messages", async () => {
    const { directory, controller } = await setup();
    await expect(
      connectBubbleControl(
        directory,
        "different",
        () => {},
        () => {}
      )
    ).rejects.toThrow("INCOMPATIBLE_AGENT");
    const endpoint = JSON.parse(await readFile(join(directory, "endpoint.json"), "utf8"));
    await new Promise<void>((resolve) => {
      const socket = createConnection(endpoint.pipe, () =>
        socket.write(JSON.stringify({ id: 1, type: "change", token: "wrong" }) + "\n")
      );
      socket.on("close", resolve);
      socket.on("error", () => socket.destroy());
    });
    expect(controller.snapshot().revision).toBe(0);
  });
});
