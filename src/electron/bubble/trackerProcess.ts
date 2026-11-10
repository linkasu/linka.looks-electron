import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { performance } from "node:perf_hooks";
import { BUBBLE_PROTOCOL, type BubbleTrackerState } from "../../common/bubble/contract";

export type TrackerReply = {
  id: number;
  protocol: number;
  status: BubbleTrackerState;
  errorCode: string | null;
  sample?: { x: number; y: number; sequence: number; ageMs: number } | null;
  bounds?: { left: number; top: number; width: number; height: number };
};

export class BubbleTrackerProcess {
  private readonly child: ChildProcessWithoutNullStreams;
  private pending:
    | {
        id: number;
        started: number;
        resolve: (reply: TrackerReply) => void;
        reject: (error: Error) => void;
        timer: NodeJS.Timeout;
      }
    | undefined;
  private id = 0;
  private closed = false;
  private stopping = false;
  private readonly exited: Promise<void>;

  constructor(
    executable: string,
    private readonly onExit: (code: string) => void
  ) {
    this.child = spawn(executable, [], { windowsHide: true, stdio: "pipe" });
    this.child.stdin.on("error", () => this.fail("BACKEND_PIPE_ERROR"));
    this.child.on("error", () => this.fail("BACKEND_START_FAILED"));
    // Backend diagnostics are codes, never coordinates; stdout is consumed only by this process.
    this.child.stderr.resume();
    let buffer = "";
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf("\n")) !== -1) {
        if (end > 16384) {
          this.fail("BACKEND_PROTOCOL_ERROR");
          return;
        }
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          this.receive(JSON.parse(line));
        } catch {
          this.fail("BACKEND_PROTOCOL_ERROR");
          return;
        }
      }
      if (buffer.length > 16384) this.fail("BACKEND_PROTOCOL_ERROR");
    });
    this.exited = new Promise((resolve) =>
      this.child.once("close", () => {
        this.closed = true;
        this.rejectPending("BACKEND_STOPPED");
        if (!this.stopping) this.onExit("BACKEND_STOPPED");
        resolve();
      })
    );
  }

  request(type: "hello" | "getLatest" | "shutdown"): Promise<TrackerReply> {
    if (this.closed || this.pending) return Promise.reject(new Error("BACKEND_NOT_READY"));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail("BACKEND_TIMEOUT"), 3000);
      this.pending = { id, started: performance.now(), resolve, reject, timer };
      this.child.stdin.write(JSON.stringify({ id, type }) + "\n", (error) => {
        if (error) this.fail("BACKEND_PIPE_ERROR");
      });
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.closed) return;
    this.rejectPending("BACKEND_STOPPING");
    this.child.stdin.end(JSON.stringify({ id: ++this.id, type: "shutdown" }) + "\n");
    const force = setTimeout(() => {
      if (!this.closed) this.child.kill();
    }, 2000);
    let deadline: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.exited,
        new Promise<never>((_, reject) => {
          deadline = setTimeout(() => reject(new Error("BACKEND_STOP_TIMEOUT")), 6000);
        })
      ]);
    } finally {
      clearTimeout(force);
      clearTimeout(deadline);
    }
  }

  private receive(value: TrackerReply) {
    const request = this.pending;
    if (!request || value?.id !== request.id) return;
    const states: BubbleTrackerState[] = [
      "not-requested",
      "connecting",
      "tracking",
      "stale",
      "unavailable",
      "legacy-conflict"
    ];
    if (
      value.protocol !== BUBBLE_PROTOCOL ||
      !states.includes(value.status) ||
      (value.errorCode !== null && typeof value.errorCode !== "string")
    )
      throw new Error("INVALID_REPLY");
    if (value.sample) {
      const { x, y, sequence, ageMs } = value.sample;
      const bounds = value.bounds;
      if (
        ![x, y, sequence, ageMs].every(Number.isFinite) ||
        !Number.isSafeInteger(sequence) ||
        sequence < 0 ||
        ageMs < 0 ||
        !bounds ||
        ![bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite) ||
        bounds.width <= 0 ||
        bounds.height <= 0
      )
        throw new Error("INVALID_SAMPLE");
      value.sample.ageMs += performance.now() - request.started;
    }
    clearTimeout(request.timer);
    this.pending = undefined;
    request.resolve(value);
  }

  private rejectPending(code: string) {
    const request = this.pending;
    this.pending = undefined;
    if (request) {
      clearTimeout(request.timer);
      request.reject(new Error(code));
    }
  }

  private fail(code: string) {
    this.rejectPending(code);
    if (!this.stopping && !this.closed) {
      this.onExit(code);
      this.child.kill();
    }
  }
}
