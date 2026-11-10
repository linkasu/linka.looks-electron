import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { watch, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { connectBubbleControl } from "./controlChannel";
import type { BubbleChange, BubbleResult, BubbleSnapshot } from "../../common/bubble/contract";

export function bubbleInstallationId() {
  return createHash("sha256").update(resolve(app.getAppPath()).toLowerCase()).digest("hex");
}

function launchLooks(args: string[]) {
  const root = app.getAppPath();
  const entry = existsSync(join(root, "package.json")) ? root : join(root, "main.js");
  const child = spawn(process.execPath, [...(app.isPackaged ? [] : [entry]), ...args], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  return child;
}

export function openBubbleSettings() {
  launchLooks(["--bubble-settings"]).on("error", () => undefined);
}

export class BubbleClient {
  private connection: Awaited<ReturnType<typeof connectBubbleControl>> | undefined;
  private opening: Promise<void> | undefined;
  private state: BubbleSnapshot | undefined;
  private disposed = false;
  private generation = 0;

  constructor(
    private readonly directory: string,
    private readonly changed: (state: BubbleSnapshot) => void
  ) {}

  async getState(): Promise<BubbleResult> {
    return this.state ? { ok: true, state: this.state } : { ok: false, code: "AGENT_UNAVAILABLE" };
  }

  async connect(startIfMissing: boolean): Promise<void> {
    if (this.connection || this.disposed) return;
    if (this.opening) return this.opening;
    this.opening = this.open(startIfMissing).finally(() => {
      this.opening = undefined;
    });
    return this.opening;
  }

  async change(command: BubbleChange): Promise<BubbleResult> {
    try {
      await this.connect(true);
      return await this.connection!.request("change", command);
    } catch (error) {
      return { ok: false, code: (error as Error).message, state: this.state };
    }
  }

  dispose() {
    this.disposed = true;
    ++this.generation;
    this.connection?.close();
    this.connection = undefined;
  }

  private async attach() {
    const generation = ++this.generation;
    const connection = await connectBubbleControl(
      this.directory,
      bubbleInstallationId(),
      (state) => {
        if (this.disposed || generation !== this.generation) return;
        this.state = state;
        this.changed(state);
      },
      () => {
        if (generation !== this.generation) return;
        this.connection = undefined;
        if (!this.disposed && this.state) {
          this.state = {
            ...this.state,
            stateSequence: this.state.stateSequence,
            tracker: "unavailable",
            displayed: false,
            errorCode: "AGENT_STOPPED"
          };
          this.changed(this.state);
        }
      }
    );
    if (this.disposed) {
      connection.close();
      return;
    }
    this.connection = connection;
    try {
      const result = await connection.request("watch");
      if (!result.ok || !result.state) throw new Error(result.code || "AGENT_UNAVAILABLE");
      this.state = result.state;
    } catch (error) {
      connection.close();
      this.connection = undefined;
      throw error;
    }
  }

  private async open(startIfMissing: boolean) {
    try {
      await this.attach();
      return;
    } catch (error) {
      if (
        !startIfMissing ||
        ["INCOMPATIBLE_AGENT", "INVALID_ENDPOINT", "INSECURE_PROFILE"].includes(
          (error as Error).message
        )
      )
        throw error;
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await new Promise<void>((resolveReady, reject) => {
      let attempting = false;
      let dirty = false;
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(deadline);
        watcher.close();
        if (error) reject(error);
        else resolveReady();
      };
      const attempt = () => {
        if (finished) return;
        if (attempting) {
          dirty = true;
          return;
        }
        attempting = true;
        void this.attach().then(
          () => finish(),
          () => {
            attempting = false;
            if (dirty) {
              dirty = false;
              attempt();
            }
          }
        );
      };
      const watcher = watch(this.directory, (_event, file) => {
        if (file === "endpoint.json") attempt();
      });
      watcher.on("error", () => finish(new Error("AGENT_START_FAILED")));
      const deadline = setTimeout(() => finish(new Error("AGENT_START_TIMEOUT")), 10000);
      const child = launchLooks(["--bubble-agent"]);
      child.once("error", () => finish(new Error("AGENT_START_FAILED")));
      child.once("exit", () => attempt());
      attempt();
    });
  }
}

export function registerBubbleClient(owner: BrowserWindow, rendererUrl: string) {
  if (process.platform !== "win32") return;
  const baseUrl = new URL(rendererUrl).href.split("#")[0];
  const client = new BubbleClient(join(app.getPath("userData"), "bubble-agent"), (state) => {
    if (!owner.isDestroyed()) owner.webContents.send("bubble:state", state);
    if (state.errorCode === "UPDATE_PREPARING") setImmediate(() => app.quit());
  });
  const startup = client.connect(true).catch(() => undefined);
  const authorized = (event: IpcMainInvokeEvent) =>
    !owner.isDestroyed() &&
    event.sender === owner.webContents &&
    event.senderFrame === owner.webContents.mainFrame &&
    event.senderFrame.url.split("#")[0] === baseUrl;
  ipcMain.handle("bubble:getState", async (event) => {
    if (!authorized(event)) return { ok: false, code: "UNAUTHORIZED" };
    await startup;
    return client.getState();
  });
  ipcMain.handle("bubble:change", (event, command: BubbleChange) =>
    authorized(event) ? client.change(command) : { ok: false, code: "UNAUTHORIZED" }
  );
  ipcMain.handle("bubble:restart", async (event) => {
    if (!authorized(event)) return { ok: false, code: "UNAUTHORIZED" };
    try {
      await client.connect(true);
      return client.getState();
    } catch {
      return { ok: false, code: "AGENT_UNAVAILABLE" };
    }
  });
  owner.once("closed", () => {
    client.dispose();
    for (const channel of ["bubble:getState", "bubble:change", "bubble:restart"])
      ipcMain.removeHandler(channel);
  });
}

export async function prepareBubbleUpdate() {
  let connection: Awaited<ReturnType<typeof connectBubbleControl>>;
  try {
    connection = await connectBubbleControl(
      app.getPath("userData"),
      bubbleInstallationId(),
      () => {},
      () => {}
    );
  } catch (error) {
    if (["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code || "")) return;
    throw error;
  }
  try {
    const result = await connection.request("prepare-update");
    if (!result.ok) throw new Error("UPDATE_PREPARE_FAILED");
  } finally {
    connection.close();
  }
}
