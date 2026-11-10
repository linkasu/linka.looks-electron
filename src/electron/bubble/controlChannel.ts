import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, createConnection, type Socket } from "node:net";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join, win32 } from "node:path";
import { spawn } from "node:child_process";
import {
  BUBBLE_PROTOCOL,
  type BubbleResult,
  type BubbleSnapshot
} from "../../common/bubble/contract";
import type { BubbleController } from "./controller";

type Endpoint = { protocol: number; installationId: string; pipe: string; token: string };
const PIPE_PREFIX = "\\\\.\\pipe\\linka-bubble-";
const MAX_MESSAGE = 16384;
const privateDirectories = new Map<string, Promise<void>>();

export async function assertPrivateBubbleDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") return;
  const root = process.env.SystemRoot;
  if (!root || !win32.isAbsolute(root)) throw new Error("INSECURE_PROFILE");
  const existing = privateDirectories.get(directory);
  if (existing) return existing;
  // The directory owner/admins already control this process's capability; validate once per session.
  const proof = new Promise<void>((resolve, reject) => {
    const probe = spawn(
      join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; $path=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
          Buffer.from(directory, "utf8").toString("base64") +
          "')); " +
          "$me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; " +
          "$trusted=@($me,'S-1-5-18','S-1-5-32-544','S-1-3-0','S-1-3-4'); " +
          "$acl=[IO.Directory]::GetAccessControl($path); " +
          "if($trusted -notcontains $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value) { exit 2 }; " +
          "foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) { " +
          "if($rule.AccessControlType -eq 'Allow' -and $trusted -notcontains $rule.IdentityReference.Value " +
          "-and ([long]$rule.FileSystemRights -band 3490512967) -ne 0) { exit 2 } }; exit 0"
      ],
      {
        env: { SystemRoot: root, WINDIR: root },
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"]
      }
    );
    let settled = false;
    const finish = (allowed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (allowed) resolve();
      else reject(new Error("INSECURE_PROFILE"));
    };
    const failed = () => {
      if (probe.pid) probe.kill();
      finish(false);
    };
    const deadline = setTimeout(failed, 10000);
    probe.once("error", failed);
    probe.once("close", (code) => finish(code === 0));
    probe.stdout.resume();
  });
  privateDirectories.set(directory, proof);
  try {
    await proof;
  } catch (error) {
    privateDirectories.delete(directory);
    throw error;
  }
}

function readMessages(socket: Socket, receive: (message: Record<string, unknown>) => void) {
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf("\n")) !== -1) {
      if (end > MAX_MESSAGE) {
        socket.destroy();
        return;
      }
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        const message = JSON.parse(line);
        if (!message || typeof message !== "object" || Array.isArray(message))
          throw new Error("INVALID_MESSAGE");
        receive(message);
      } catch {
        socket.destroy();
        return;
      }
    }
    if (buffer.length > MAX_MESSAGE) socket.destroy();
  });
}

function send(socket: Socket, message: unknown) {
  if (!socket.destroyed) {
    // Slow consumers must not retain an unbounded history of application state.
    if (socket.writableLength > MAX_MESSAGE * 4) socket.destroy();
    else socket.write(JSON.stringify(message) + "\n");
  }
}

export async function serveBubbleControl(
  directory: string,
  installationId: string,
  controller: BubbleController,
  prepareUpdate: () => Promise<void>
) {
  await assertPrivateBubbleDirectory(directory);
  const endpoint: Endpoint = {
    protocol: BUBBLE_PROTOCOL,
    installationId,
    pipe:
      process.platform === "win32"
        ? PIPE_PREFIX + randomBytes(16).toString("hex")
        : join(directory, "control.sock"),
    token: randomBytes(32).toString("hex")
  };
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    if (sockets.size >= 16) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    let unwatch: (() => void) | undefined;
    let pending = 0;
    socket.on("error", () => socket.destroy());
    socket.on("close", () => {
      sockets.delete(socket);
      unwatch?.();
    });
    readMessages(socket, (message) => {
      const authenticated =
        typeof message.token === "string" &&
        /^[a-f0-9]{64}$/.test(message.token) &&
        timingSafeEqual(Buffer.from(message.token, "hex"), Buffer.from(endpoint.token, "hex"));
      if (
        !authenticated ||
        message.installationId !== installationId ||
        message.protocol !== BUBBLE_PROTOCOL ||
        !Number.isSafeInteger(message.id) ||
        (message.id as number) <= 0 ||
        ++pending > 8
      ) {
        socket.destroy();
        return;
      }
      void (async () => {
        let result: BubbleResult;
        if (message.type === "watch") {
          unwatch?.();
          unwatch = controller.watch((state) => send(socket, { event: "state", state }));
          result = { ok: true, state: controller.snapshot() };
        } else if (message.type === "change") {
          result = await controller.change(message.change);
        } else if (message.type === "prepare-update") {
          controller.runtime("unavailable", false, "UPDATE_PREPARING");
          await controller.stop();
          send(socket, { id: message.id, ok: true, state: controller.snapshot() });
          await prepareUpdate();
          return;
        } else result = { ok: false, code: "INVALID_REQUEST" };
        send(socket, { id: message.id, ...result });
      })()
        .catch(() => send(socket, { id: message.id, ok: false, code: "INTERNAL_ERROR" }))
        .finally(() => {
          --pending;
        });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint.pipe, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  server.on("error", () => {
    for (const socket of sockets) socket.destroy();
  });
  const file = join(directory, "endpoint.json");
  const temporary = join(directory, `.endpoint-${randomBytes(8).toString("hex")}.tmp`);
  try {
    // On Windows the directory inherits the user's private AppData ACL; mode alone is not an ACL.
    await writeFile(temporary, JSON.stringify(endpoint), { flag: "wx", mode: 0o600 });
    await rename(temporary, file);
  } catch (error) {
    server.close();
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      const current = JSON.parse(await readFile(file, "utf8"));
      if (current.token === endpoint.token) await unlink(file);
    } catch {
      /* A stopped instance never removes another instance's endpoint. */
    }
  };
}

export async function connectBubbleControl(
  directory: string,
  installationId: string,
  onState: (state: BubbleSnapshot) => void,
  onClose: () => void
) {
  await assertPrivateBubbleDirectory(directory);
  const text = await readFile(join(directory, "endpoint.json"), "utf8");
  if (text.length > 4096) throw new Error("INVALID_ENDPOINT");
  const endpoint = JSON.parse(text) as Endpoint;
  if (endpoint.protocol !== BUBBLE_PROTOCOL || endpoint.installationId !== installationId)
    throw new Error("INCOMPATIBLE_AGENT");
  const validPipe =
    typeof endpoint.pipe === "string" &&
    (process.platform === "win32"
      ? endpoint.pipe.startsWith(PIPE_PREFIX) &&
        /^[a-f0-9]{32}$/.test(endpoint.pipe.slice(PIPE_PREFIX.length))
      : endpoint.pipe === join(directory, "control.sock"));
  if (!validPipe || !/^[a-f0-9]{64}$/.test(endpoint.token)) throw new Error("INVALID_ENDPOINT");
  const socket = createConnection(endpoint.pipe);
  const pending = new Map<
    number,
    {
      resolve: (value: BubbleResult) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  let id = 0;
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("AGENT_TIMEOUT"));
    }, 1500);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  socket.on("error", () => socket.destroy());
  socket.on("close", () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("AGENT_STOPPED"));
    }
    pending.clear();
    onClose();
  });
  readMessages(socket, (message) => {
    if (message.event === "state" && message.state) onState(message.state as BubbleSnapshot);
    else if (typeof message.id === "number") {
      const request = pending.get(message.id);
      if (request) {
        clearTimeout(request.timer);
        pending.delete(message.id);
        request.resolve(message as BubbleResult);
      }
    }
  });
  await ready;
  return {
    request(type: string, change?: unknown): Promise<BubbleResult> {
      if (socket.destroyed) return Promise.reject(new Error("AGENT_STOPPED"));
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error("AGENT_TIMEOUT"));
          socket.destroy();
        }, 5000);
        pending.set(requestId, { resolve, reject, timer });
        send(socket, { id: requestId, type, change, ...endpoint });
      });
    },
    close() {
      socket.destroy();
    }
  };
}
