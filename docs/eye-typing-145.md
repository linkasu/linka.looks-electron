# Issue 145: isolated eye-typing mode

Historical report of the independent layout/model/adapter-stub implementation.
For the subsequent isolated-window integration, see [eye-typing-integration-145.md](eye-typing-integration-145.md).
Base: `origin/main` at `7976d0b` (PR146 merged).
Branch: `feat/145-eye-typing-fresh`.

## Behavior and acceptance coverage

| Requirement                                        | Implementation                                                              | Automated coverage                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Separate start button and page                     | Home root → `/eye-typing`, gaze interaction mode                            | Electron scenario                                                                              |
| Large dwell targets, shared pause/dwell            | Existing `EyeButton`, `GazePauseButton`, real `PageWatcher`; paginated keys | Tracker-protocol unit test, dwell/pause UI test; Electron bounds ≥64px at 800×600 and 1024×768 |
| RU and manual EN                                   | Complete alphabets, persistent uppercase toggle, 12 letters per page        | Model/UI tests and Electron typing                                                             |
| Sticky numbers/symbols                             | Insertion and language changes do not leave the screen; «Буквы» returns     | Model/UI/Electron tests                                                                        |
| Cursor replaces keyboard                           | Character/word/start/end navigation, no text changes on screen switch       | Model/UI/Electron tests                                                                        |
| Speak the entire text without clearing             | Existing `TTS.instance.playText`, error displayed without editing draft     | UI test with mocked TTS; live speech not tested                                                |
| Predictor replacement + automatic space = one Undo | Whole word around caret replaced, existing space reused                     | Model/UI tests with injected provider                                                          |
| Clear immediately, Undo restores text/caret        | Same edit history as insertion/deletion/completion, no dialog               | Model/UI/Electron tests                                                                        |
| Draft/caret survive return/restart                 | Dedicated `eyeTypingDraftV1` record in existing electron-store              | Persistence/UI tests and actual isolated Electron restart                                      |

Undo retains the latest 100 text edits for the current visit. Only draft/caret are persisted;
Undo history, language, screen and case are not restored on restart. Cursor positions count
Unicode code points. Combined grapheme clusters are not treated as a single character.

## Predictor integration blocker

`src/frontend/services/typingPredictor.ts` deliberately returns no suggestions. The UI keeps
manual RU/EN typing available and states that RU suggestions are unavailable. No dependency,
network endpoint or invented dictionary was added.

The local adapter seam is `suggest(prefix: string): Promise<readonly string[]>`; it is **not**
a claim about the pending library's API. Once the package/export/initialization contract is
available, implement this adapter against it. The UI accepts up to three distinct Cyrillic
words, discards obsolete async results, and falls back to manual input on provider failure.
Test providers exercise completion, atomic Undo and async races independently of that contract.

## Safety and compatibility

- Initial observation: 2026-11-03 06:54:23 UTC. Original checkout was dirty; no independent
  repository writer was confirmed from process/cwd evidence. Shared OpenCode server activity
  cannot prove that no writer exists. No git lock/fence was found; nothing was removed.
- All source edits are in the new worktree. Original dirty files, other worktrees and sessions
  are untouched. No prior uncertain operation was resumed.
- The typing view is the only new draft writer. Each edit/navigation writes text+caret in one
  synchronous store update. A failed initial read blocks editing; a failed save leaves the
  in-memory text visible with a warning. No schema migration or existing store field changes.
- Older binaries ignore the new key; rolling back leaves the draft record intact. No counters,
  locks, release version, credentials, permissions or protection settings were changed.
- Tests use temporary userData and mock external TTS/metrics. Existing installed dependencies
  are reused through a worktree-local `node_modules` symlink; no native rebuild/install was run.
- Draft PR publication is blocked by unavailable GitHub MCP in this session. No push, merge
  or release has been performed. Restart OpenCode with the configured GitHub MCP to publish.

## Verification commands

Results on 2026-11-03 with Node 22.22.2:

- Typecheck, repository-wide ESLint and Prettier check passed. Typecheck and lint for the
  changed fixtures were repeated after the HomeView fixture correction.
- New focused tests: **21 passed** (model, persistence, UI and real tracker IPC protocol).
- Full renderer run: **246 passed, 1 skipped, 1 failed**. The failure was the pre-existing
  HomeView fixture lacking a stub for the new EyeButton. The fixture was updated, its route
  assertions extended, and its focused rerun passed (**1 passed**). The full renderer suite
  was not repeated after this fixture-only change.
- Full main-process run: **76 passed, 2 failed**. Failures are
  `security-network.spec.ts` (updater runtime redirects) and `security-redirect.spec.ts`.
  Both retain fixture authorization headers when the tests expect them removed. A separate
  clean baseline worktree at `7976d0b`, using the same installed dependencies, reproduced
  **the same 2 failures** (and 3 passing tests). No security fix is included in issue 145.
- Focused Electron E2E: **1 passed**, including real app close/relaunch, persistence, target
  sizes, pause/resume and screenshots. Existing full E2E suite was not run.
- Consequently the full quality gate is **not green**; no claim of release readiness or
  feature completion is made.

Use Node 22.22.2 from `.nvmrc` and one worker:

```sh
npm run typecheck
npm run lint
npm run format:check
npx vitest run --maxWorkers=1
npx vitest run --config vitest.node.config.ts --maxWorkers=1
E2E_DEV_SERVER_URL=http://127.0.0.1:5187 E2E_REMOTE_DEBUGGING_PORT=9387 E2E_TEST_ELECTRON_REMOTE_DEBUGGING_PORT=9388 npx playwright test tests/e2e/eye-typing.spec.ts
```

The Electron scenario writes screenshots under `test-results/eye-typing-*/`. When dependencies
are symlinked from the original checkout, Vite warns that icon font paths are outside its dev
serving allow-list. No serving/security setting was weakened to silence that warning. Text
labels remain available. Installer builds, releases and real Tobii calibration were not run.
