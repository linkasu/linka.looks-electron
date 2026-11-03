# Electron main API — keyboard issue145 contract

Draft contract, GPL-3.0-or-later. Import `Predictor`, `PredictorError` and
`applySuggestion` from `@linkasu/predictor-electron` in **main only**.

```ts
const predictor = new Predictor({ executablePath, modelPath }); // absolute trusted paths
await predictor.start(); // validates model; optional, predict also initializes
const input = { text: "я хочу  завтра", caret: 7, language: "ru" as const };
const result = await predictor.predict(input, { signal });
const edit = applySuggestion(input, result, 0); // { text, caret, language }
await predictor.dispose(); // idempotent; await before main exits
```

`predict(input: {text: string; caret: number; language: 'ru' | 'en'},
options?: {signal?: AbortSignal}): Promise<Prediction>`.
`Prediction` has `{text: string[], pos: number, endOfWord: boolean, input: Input}`.
`pos <= 0` is UTF-16 tail deletion relative to the caret, **not** full text end.
Zero appends. `applySuggestion(current, result, index)` checks exact text, caret,
language and UTF-16 boundaries; replaces `[caret + pos, caret)` and preserves
`text.slice(caret)` verbatim. It never inserts an implicit space. The caller must
also invalidate displayed suggestions after editing/navigation (including an ABA
edit back to identical text). Selections must be collapsed by the host first.

RU sends only `text.slice(0, caret)` to the end-only core. Mid-word behavior is
prefix completion, not replacement of the suffix. EN returns an empty result
without starting a process or requiring a model; manual typing is unchanged.
Only RU and EN are accepted. No learning, profile writes or telemetry.

One instance serves one input stream. A newer predict/start invalidates older
pending work (`STALE`); AbortSignal rejects with `CANCELLED`; dispose rejects
pending work with `DISPOSED`. No prediction result is applied automatically.
State: `idle -> running -> ready | failed`; another request may retry a failed
instance; `disposed` is terminal. EN can be ready without a loaded model.

Errors are `PredictorError` with stable `code`: `INVALID_INPUT`, `MODEL_MISSING`,
`MODEL_CORRUPT`, `SPAWN`, `PROCESS`, `PROTOCOL`, `TIMEOUT`, `CANCELLED`, `STALE`,
`DISPOSED`. Do not forward raw Error objects across Electron IPC; map to a
serializable `{code,message}`. Error messages never include query or model data.

## Transport / bounds

The dedicated `lp-electron` binary receives `{q, lang:"ru", limit:5}` via stdin
and writes exactly one JSON `{text:string[],pos:int,endOfWord:bool}` to stdout.
Only the model path is in argv; no shell. Each operation uses a fresh process
and loads the immutable model, including `start()` (empty-query validation).
This deliberately trades warm-model latency for simple process cancellation;
no warm-cache or <100ms claim. At most one child lives per instance: replacement
waits for the previous child's close. Only owned children are terminated.
Input is limited to 16,384 UTF-16 units / 128 KiB JSON, output to 256 KiB,
deadline 5s by default (configurable 1–60s). Overdue/cancelled children receive
SIGTERM, then SIGKILL after 250ms if still alive. No unbounded request queue:
superseded callers reject before spawning.

## Electron boundary / packaging

Keep `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
Do not expose this class, executable/model paths, arbitrary channels, or Node
APIs to renderer. A host-owned narrow preload bridge validates sender/frame and
payload, owns one predictor per editor, and returns only serializable results.
AbortSignal stays in main; renderer cancellation uses a validated request ID.
No IPC handler is installed by this library; host authorization remains required.

Build `cargo build --locked -p predictor-cli --bin lp-electron`; copy binary and
approved immutable model through the host packager's `extraResources`, outside
ASAR. Pass absolute paths under `process.resourcesPath`, not renderer input.
Ship GPL license/source obligations and separate model notices. Tiny test model
is synthetic CC0, not a production Russian model. No npm publication or release.

Tests exercise real child processes and the real Rust core with tiny model.
Package checks cover npm tarball contents and installed imports. macOS local
execution is not signed/notarized Electron application qualification. Linux,
Windows, architecture matrices, ASAR extraction, code signing, hardened runtime
and packaged Electron IPC are unqualified until run on those targets.
