import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertPrivateBubbleDirectory } from "../../bubble/controlChannel";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), spawnSync: vi.fn(() => ({ status: 0 })) }));
vi.mock("node:child_process", () => mocks);
let directory: string;
let child: EventEmitter & { pid: number; stdin: PassThrough; kill: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "bubble-acl-"));
  const runtime = process;
  vi.stubGlobal("process", {
    ...runtime,
    platform: "win32",
    env: { ...runtime.env, SystemRoot: "C:\\Windows" }
  });
  child = Object.assign(new EventEmitter(), { pid: 42, stdin: new PassThrough(), kill: vi.fn() });
  mocks.spawn.mockReturnValue(child);
  vi.clearAllMocks();
});
afterEach(async () => {
  child.emit("close", 0);
  child.stdin.destroy();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});

describe("Windows private profile probe", () => {
  it("keeps the main event loop responsive while a slow ACL process is pending", async () => {
    let settled = false;
    const result = assertPrivateBubbleDirectory(directory).then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1));
    let responsive = false;
    await new Promise<void>((resolve) =>
      setImmediate(() => {
        responsive = true;
        resolve();
      })
    );
    expect(responsive).toBe(true);
    expect(settled).toBe(false);
    expect(mocks.spawnSync).not.toHaveBeenCalled();
    const args = mocks.spawn.mock.calls[0][1] as string[];
    expect(args.at(-1)).toContain(Buffer.from(directory, "utf8").toString("base64"));
    expect(args.at(-1)).not.toContain(directory);
    expect(mocks.spawn.mock.calls[0][2].stdio).toBe("ignore");
    child.emit("close", 0);
    await result;
    await assertPrivateBubbleDirectory(directory);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the asynchronous ACL probe refuses the directory", async () => {
    const result = assertPrivateBubbleDirectory(directory).then(
      () => null,
      (error: Error) => error
    );
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1));
    child.emit("close", 2);
    expect((await result)?.message).toBe("INSECURE_PROFILE");
  });

  it("bounds a hung ACL probe and terminates only its owned child", async () => {
    vi.useFakeTimers();
    const result = assertPrivateBubbleDirectory(directory).then(
      () => null,
      (error: Error) => error
    );
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(10000);
    expect((await result)?.message).toBe("INSECURE_PROFILE");
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(mocks.spawnSync).not.toHaveBeenCalled();
  });
});
