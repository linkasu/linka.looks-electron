import { expect, test, type ElectronApplication } from "@playwright/test";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { connectBubbleControl } from "../../src/electron/bubble/controlChannel";
import {
  cleanupE2EContext,
  createE2EContext,
  firstTestWindow,
  launchTestElectron,
  readTestBubbleState
} from "./helpers";

test("Bubble survives main exit, reattaches without duplication, and stops with fixture cleanup", async () => {
  test.skip(process.platform !== "win32", "The independent Bubble agent is a Windows feature");
  test.setTimeout(90000);
  const context = createE2EContext();
  const directory = join(context.userDataDir, "bubble-agent");
  let app: ElectronApplication | undefined;
  let control: Awaited<ReturnType<typeof connectBubbleControl>> | undefined;
  let stopped = false;
  try {
    app = await launchTestElectron(context);
    await firstTestWindow(app);
    const initial = await readTestBubbleState(app);
    expect(initial.ok, JSON.stringify(initial)).toBe(true);
    expect(initial.state).toMatchObject({
      preferences: { enabled: false },
      tracker: "not-requested",
      displayed: false,
      errorCode: null
    });
    expect(initial.state?.instanceId).toBeTruthy();
    const appRoot = await app.evaluate(({ app }) => app.getAppPath());
    const installationId = createHash("sha256")
      .update(resolve(appRoot).toLowerCase())
      .digest("hex");
    control = await connectBubbleControl(
      directory,
      installationId,
      () => {},
      () => {
        stopped = true;
      }
    );
    expect((await control.request("watch")).state?.instanceId).toBe(initial.state?.instanceId);

    const exited = once(app.process(), "exit", { signal: AbortSignal.timeout(15000) });
    await app.evaluate(({ app }) => {
      setImmediate(() => app.quit());
    });
    await exited;
    const independent = await control.request("watch");
    expect(independent.ok).toBe(true);
    expect(independent.state).toEqual(initial.state);
    expect(stopped).toBe(false);

    app = await launchTestElectron(context);
    await firstTestWindow(app);
    const reattached = await readTestBubbleState(app);
    expect(reattached.ok, JSON.stringify(reattached)).toBe(true);
    expect(reattached.state).toEqual(initial.state);
    expect((await control.request("watch")).state?.instanceId).toBe(initial.state?.instanceId);

    await app.close();
    await expect.poll(() => stopped, { timeout: 10000 }).toBe(true);
    await expect.poll(() => existsSync(join(directory, "endpoint.json"))).toBe(false);
  } finally {
    try {
      await app?.close();
    } finally {
      control?.close();
      cleanupE2EContext(context);
    }
  }
});
