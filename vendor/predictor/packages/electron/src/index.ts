import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

export interface Input {
  text: string;
  caret: number;
  language: "ru" | "en";
}

export interface Prediction {
  text: string[];
  pos: number;
  endOfWord: boolean;
  input: Input;
}

export type ErrorCode =
  | "INVALID_INPUT"
  | "MODEL_MISSING"
  | "MODEL_CORRUPT"
  | "SPAWN"
  | "PROCESS"
  | "PROTOCOL"
  | "TIMEOUT"
  | "CANCELLED"
  | "STALE"
  | "DISPOSED";

export class PredictorError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(`Predictor: ${code}`);
    this.name = "PredictorError";
  }
}

function boundary(text: string, position: number): boolean {
  return (
    Number.isSafeInteger(position) &&
    position >= 0 &&
    position <= text.length &&
    !(
      position > 0 &&
      position < text.length &&
      /[\uD800-\uDBFF]/u.test(text[position - 1]) &&
      /[\uDC00-\uDFFF]/u.test(text[position])
    )
  );
}

function validate(input: Input): void {
  if (
    !input ||
    typeof input.text !== "string" ||
    input.text.length > 16384 ||
    !boundary(input.text, input.caret) ||
    !["ru", "en"].includes(input.language)
  ) {
    throw new PredictorError("INVALID_INPUT");
  }
  // JSON permits lone surrogates; Rust strings do not. Reject before IPC.
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(input.text)) {
    throw new PredictorError("INVALID_INPUT");
  }
  if (
    input.language === "ru" &&
    Buffer.byteLength(input.text.slice(0, input.caret), "utf8") > 16384
  ) {
    throw new PredictorError("INVALID_INPUT");
  }
}

function validResponse(value: unknown, input: Input): value is Omit<Prediction, "input"> {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.text) &&
    v.text.length <= 5 &&
    v.text.every(
      (t) =>
        typeof t === "string" &&
        t.length <= 16384 &&
        !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(t)
    ) &&
    typeof v.pos === "number" &&
    v.pos <= 0 &&
    boundary(input.text, input.caret + v.pos) &&
    typeof v.endOfWord === "boolean"
  );
}

export function applySuggestion(current: Input, result: Prediction, index: number): Input {
  validate(current);
  if (
    !result?.input ||
    current.text !== result.input.text ||
    current.caret !== result.input.caret ||
    current.language !== result.input.language
  ) {
    throw new PredictorError("STALE");
  }
  if (
    !validResponse(result, current) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= result.text.length
  )
    throw new PredictorError("INVALID_INPUT");
  const start = current.caret + result.pos;
  const insertion = result.text[index];
  return {
    ...current,
    text: current.text.slice(0, start) + insertion + current.text.slice(current.caret),
    caret: start + insertion.length
  };
}

export interface PredictorOptions {
  executablePath: string;
  modelPath: string;
  timeoutMs?: number;
}

export type State = "idle" | "running" | "ready" | "failed" | "disposed";

/** Main-process only. Each instance owns at most one short-lived sidecar. */
export class Predictor {
  #state: State = "idle";
  #revision = 0;
  #tail: Promise<void> = Promise.resolve();
  #cancel?: (code: ErrorCode) => void;
  readonly #options: Required<PredictorOptions>;

  constructor(options: PredictorOptions) {
    if (
      !options ||
      typeof options.executablePath !== "string" ||
      typeof options.modelPath !== "string" ||
      !isAbsolute(options.executablePath) ||
      !isAbsolute(options.modelPath) ||
      options.executablePath.includes("\0") ||
      options.modelPath.includes("\0") ||
      !Number.isInteger(options.timeoutMs ?? 5000) ||
      (options.timeoutMs ?? 5000) < 1 ||
      (options.timeoutMs ?? 5000) > 60000
    ) {
      throw new PredictorError("INVALID_INPUT");
    }
    this.#options = { ...options, timeoutMs: options.timeoutMs ?? 5000 };
  }

  get state(): State {
    return this.#state;
  }

  #ensureOpen(): void {
    if (this.#state === "disposed") throw new PredictorError("DISPOSED");
  }

  async start(): Promise<void> {
    await this.predict({ text: "", caret: 0, language: "ru" });
  }

  async predict(input: Input, options: { signal?: AbortSignal } = {}): Promise<Prediction> {
    this.#ensureOpen();
    validate(input);
    const snapshot = { text: input.text, caret: input.caret, language: input.language };
    const revision = ++this.#revision;
    this.#cancel?.("STALE");
    const previous = this.#tail;
    const signal = options.signal;
    let cancelled: ErrorCode | undefined = signal?.aborted ? "CANCELLED" : undefined;
    const onAbort = () => {
      cancelled = "CANCELLED";
      if (revision === this.#revision) this.#cancel?.("CANCELLED");
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    this.#state = "running";
    try {
      await previous;
      this.#ensureOpen();
      if (revision !== this.#revision) throw new PredictorError("STALE");
      if (cancelled) throw new PredictorError(cancelled);
      const running =
        snapshot.language === "en"
          ? Promise.resolve({ text: [], pos: 0, endOfWord: false })
          : this.#run(snapshot);
      // Pending callers share child cleanup; they never form a work queue.
      this.#tail = running.then(
        () => {},
        () => {}
      );
      const response = await running;
      this.#ensureOpen();
      if (revision !== this.#revision) throw new PredictorError("STALE");
      if (cancelled) throw new PredictorError(cancelled);
      this.#state = "ready";
      return { ...response, input: snapshot };
    } catch (error) {
      if (revision === this.#revision && this.state !== "disposed") this.#state = "failed";
      throw error;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  async dispose(): Promise<void> {
    this.#state = "disposed";
    ++this.#revision;
    this.#cancel?.("DISPOSED");
    await this.#tail;
  }

  #run(input: Input): Promise<Omit<Prediction, "input">> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.#options.executablePath, [this.#options.modelPath], {
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "ignore"]
      });
      const chunks: Buffer[] = [];
      let size = 0;
      let failure: ErrorCode | undefined;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const cancel = (code: ErrorCode) => {
        if (failure) return;
        failure = code;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          child.kill("SIGKILL");
        }, 250);
      };
      this.#cancel = cancel;
      const timer = setTimeout(() => cancel("TIMEOUT"), this.#options.timeoutMs);
      child.on("error", () => {
        failure ??= "SPAWN";
      });
      child.stdin.on("error", () => cancel("PROCESS"));
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 256 * 1024) cancel("PROTOCOL");
        else if (!failure) chunks.push(chunk);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        if (this.#cancel === cancel) this.#cancel = undefined;
        if (!failure && code !== 0) {
          failure =
            (
              { 10: "MODEL_MISSING", 11: "MODEL_CORRUPT", 12: "INVALID_INPUT" } as Record<
                number,
                ErrorCode
              >
            )[code ?? -1] ?? "PROCESS";
        }
        if (failure) {
          reject(new PredictorError(failure));
          return;
        }
        try {
          const response: unknown = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))
          );
          if (!validResponse(response, input)) throw new Error();
          resolve(response);
        } catch {
          reject(new PredictorError("PROTOCOL"));
        }
      });
      const request = JSON.stringify({ q: input.text.slice(0, input.caret), lang: "ru", limit: 5 });
      if (Buffer.byteLength(request) > 128 * 1024) cancel("INVALID_INPUT");
      else child.stdin.end(request);
    });
  }
}
