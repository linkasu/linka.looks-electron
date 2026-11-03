# Issue145: predictor integration handoff

## Current integration: Vue Router

The keyboard now renders at `/eye-typing` inside the existing main window. Entering
and leaving the route never creates, hides, resizes or replaces a BrowserWindow.
It shares the application's store, TTS, settings and gaze watcher; native move and
resize events refresh the main window's cached gaze geometry.

Prediction remains main-process-only through `typing:predict`, `typing:cancel`
and `typing:release`. Main checks the owner webContents, main frame and renderer
document URL. Route exit cancels and disposes owned work; reentry waits for cleanup.
Renderer reload/crash and application quit also release the session.

`eyeTypingDraftV1` keeps its existing text/code-point-caret format and atomic
record write. No migration is needed; rollback preserves the draft. Save limits
and caret validation now live in the shared draft service. Provider failure keeps
manual input available. The standalone browser demo remains development/test-only
and is no longer part of the production build.

**Security tradeoff:** the keyboard now shares the legacy Node-enabled renderer;
its former separate sandbox/CSP boundary no longer exists. Main-window Electron
preferences are unchanged. The historical sandbox assertions below do not apply
to the router implementation. No production model or packaged release is qualified
by this change. Restart Electron after changing the main-process integration.

Verification on Node 22.22.2:

- Typecheck, formatting and production renderer/main build passed. ESLint has no
  errors and one pre-existing unused-variable warning in `typingLayout.ts`.
- Renderer unit tests: 281 passed, 1 skipped. Main unit tests: 134 passed,
  2 failed in the same historical updater credential-redirect cases recorded below.
  The five new typing IPC tests passed; updater tests were not weakened or changed.
- Built-file Electron typing scenarios: 6 passed, including same-window bounds,
  real tiny-model inference, foreign-sender denial, gaze-geometry refresh and restart.
- Development Electron typing scenario: 1 passed. Browser demo: 15 passed; caret
  scenarios: 3 passed. Vite servers were run sequentially because they share the
  dependency-optimization cache.
- Physical gaze, production-model quality and packaged cross-platform builds were
  not requalified.

The demo's HTML-loaded modules and Vite alias adapters are explicit entry points
in `knip.json`; they remain analyzed rather than ignored. The two local updater
failures above used a shared stale `node_modules`: updater 6.8.3 / runtime 9.5.1 /
builder 26.8.1, versus lockfile 6.8.9 / 9.7.0 / 26.16.1. Runtime 9.7.0 already
contains the credential-redirect fix; clean CI installs from the lockfile.

`Checks` builds the real test sidecar from the same pinned upstream commit using
Rust 1.98.0 and stages its synthetic CC0 tiny model before unit tests. These
resources exist only in that test job, never in the release-build jobs. Standalone
keyboard/caret browser suites run there with their dedicated Playwright/Vite
configs; the default Electron suite does not mix those incompatible entry points.

## Historical isolated-window integration

The following records the previous local integration, which was **not
release-qualified and not published**.

## Inputs and ownership

- Base: `7976d0ba034b1b03ef8be6c3909780140b8ca29a`.
- Worktree: `/Volumes/data/linka/.opencode-worktrees/looks-145-predictor-593c68c3`;
  branch: `integrate/145-predictor-593c68c3`.
- Library: existing draft PR https://github.com/linkasu/linka.predictor-rust/pull/1,
  local HEAD `a83c727b4497471740b4ee31ad0ba0a46ea39633`, clean when inspected.
  Remote head/CI were supplied by the owner, not independently queried here.
- Keyboard patch SHA256:
  `5994ef717d5bc730ac6c594c3b7f5a9e4722daa77274a65d6598dac87f0a183a`.
  Applied cleanly; all 12 resulting files matched the source worktree byte-for-byte
  before integration edits. Original files/worktrees were not edited.
- OpenCode active-session API showed this task and an unrelated durable-handoff
  task. Both preceding predictor/keyboard sessions were completed. No conflicting
  writer/build process or git lock was confirmed; this is not an exclusive fence.
- The owner explicitly approved a separate isolated keyboard window after the
  existing Node-enabled renderer conflicted with the library's boundary contract.

## Integration contract

| State/action                         | Behavior                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| RU with word prefix                  | Full text and UTF-16 caret go to main; only the prefix before the caret reaches Rust       |
| Mid-word caret                       | Replace the library's tail range; preserve the suffix verbatim, not whole-word replacement |
| Word at text end                     | Completion plus one space is one Undo step                                                 |
| Existing next space                  | Reuse it, advancing the caret without changing the suffix                                  |
| EN                                   | Manual input; no renderer prediction call; library EN works without model/executable       |
| Edit/navigation, including ABA       | Clear displayed edits synchronously; abort the prior request                               |
| New prediction                       | Monotonic request ID; superseded work cancelled; one sidecar per session                   |
| Window close/crash/quit              | Dispose owned work; await child cleanup before reopening or quitting                       |
| Missing/corrupt model/provider error | Keep manual typing and the in-memory draft; no automatic result application                |

`TypingSession` uses the vendored **main-only** API snapshot and `applySuggestion`;
the snapshot is only reformatted. No new npm dependency/publication was invented.
The sidecar was rebuilt offline from an archive of the exact upstream commit,
with one Cargo build job and an isolated target directory. Test resources contain
the upstream tiny synthetic CC0 model, **not a production Russian model**.

The new window has `contextIsolation: true`, `sandbox: true`,
`nodeIntegration: false`, its own nonpersistent partition, denied permissions,
navigation/popups/webviews blocked, and a restrictive file-page CSP. Paths and
Node APIs are never exposed. Main validates sender, main frame, file URL,
request IDs, draft and geometry; errors are serializable codes only. The original
window's security preferences and updater security tests are unchanged.

One existing `BackWatch` instance is retargeted through its public `window` field.
The original renderer's PageWatcher/geometry observers are stopped while hidden
and restored on return. Isolated-window movement/resizing refreshes cached bounds;
no second tracker process, calibration or persistent device setting is introduced.
Speech uses the existing TTS instance through a validated boolean-result relay.

The draft stays in `eyeTypingDraftV1` with a **code-point** caret. UTF-16 conversion
exists only at the library boundary. Text+caret are saved together by one main
writer; initial-read failure blocks editing, save failure preserves visible text.
No migration, progress counters or new locks. Old binaries ignore the key;
rollback preserves its contents. Undo, language and keyboard mode remain ephemeral.

## Verification on 2026-11-03

Node `22.22.2`; existing installed dependencies reused through a local symlink.
No native dependency install/rebuild or shared dependency modification was run.

- `npm run typecheck`, `npm run lint`, `npm run format:check`: passed.
- Renderer suite, one worker: **248 passed, 1 skipped**.
- Main suite, one worker: **79 passed, 2 failed**. The three new session tests
  use the real Rust sidecar/model and cover UTF-16/suffix/Undo, cancellation,
  request replay and model-free EN.
- Separate clean baseline worktree at `7976d0b`: **3 passed, the same 2 failed**:
  `security-network.spec.ts` / updater runtime redirect credentials and
  `security-redirect.spec.ts` / redirect policy. Both retain fixture Authorization
  headers where removal is expected. Neither test was disabled or weakened.
- Original migrated eye-typing Electron scenario: **1 passed** (target sizes,
  sticky screens, Undo, navigation, pause/resume, close/reopen and restart).
- Built-file Electron scenario with real tiny-model prediction: passed, including
  sandbox preferences, absence of renderer Node APIs, unauthorized owner-frame
  predict/save rejection, suffix, atomic Undo, EN and restart persistence.
  A transient inspector-context failure occurred during a later run; live physical
  gaze was observed in the diagnostic run. The deterministic test fixture now
  substitutes only native tracker acquisition, retaining real BackWatch IPC and
  geometry. The final deterministic run used one worker and two repetitions:
  **2 passed**, including a native-window move followed by geometry refresh.
  This does not qualify physical gaze or calibration.
- Builds of both renderer entries, main and sandbox-compatible preload passed.
- macOS arm64 `electron-builder --dir --publish never`, reusing local Electron and
  without rebuilding shared native dependencies, produced an ad-hoc-signed app.
  Builder reported an inconsistent dependency tree; ASAR inspection found runtime
  dependencies `conf`, `usb` and `semver` absent. Packaged Electron E2E timed out:
  **packaged qualification failed**. No protection/signing policy was disabled.
  A subsequent default Playwright run cleaned that generated `test-results/`
  package; the builder failure output remains in the OpenCode transcript.

The full quality gate is **not green**. Local built-file Electron success is not
packaged, signed/notarized, cross-platform or production-model qualification.

## Remaining blockers and reproduction

GitHub MCP is unavailable in this session, so remote freshness, duplicate PR
search and publication could not be verified. No commit, push, PR, merge, release,
deployment, new credential or permanent privilege change was performed.

Before further qualification, provision an isolated consistent dependency tree,
and identify the approved production model with immutable hash, size and license
notices. No full-model latency benchmark was run: the local approved artifact was
only tiny; loading an unidentified model was not justified by memory safety.
The host reported 24 GiB RAM and 42% free at the initial memory check; this alone
does not establish that a full-model load is safe. No remote host was accessed.

```sh
npm run build
npx vitest run --maxWorkers=1
npx vitest run --config vitest.node.config.ts --maxWorkers=1
npx playwright test --config playwright.typing.config.ts
# For an already correctly packaged executable, explicitly qualify that package:
TYPING_ELECTRON_EXECUTABLE=/absolute/path/to/executable npx playwright test --config playwright.typing.config.ts
```

Real-core tests explicitly skip when staged resources are absent; a skipped run
is not integration proof. `predictor-resources/` is ignored and test-only locally.
Do not ship its tiny model as production. See `vendor/predictor/PROVENANCE.md` for
resource names, GPL source reference and model-notice requirements.
