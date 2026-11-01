# Integration of redesign #143 and functional fixes #144

This integrates the **verified fixed snapshot**, not the unfinished `feat/calm-accessible-ux` branch alone. Keyboard follow-up #145 and PR #125 are outside this change.

## Provenance

- Main integration base: `1cd6fcbc0b208705f4ad45138b0b7f8e8a2b8bd0`.
- Original UX: `fad3a19b9e7517208f1d6e9be286dbd0afecac85` plus 304 manifest-listed tracked/untracked files.
- Verified fixed source: `/Volumes/data/linka/audits/looks-144-fix-20261101/fixed`, 318 manifest-listed files, 41 changes relative to dirty UX.
- Original UX tar SHA-256: `3df5a30988c73b59ec7a387aa5413b897737ecd3a73df8965a3089c04563c0ac`.
- Fixed tar SHA-256: `4c129187db330a3fcf9a0ccd3b1d0a32e6445763de928ebd7a3597c334d2e780`.
- Exact fixed snapshot Git tree: `04cd082d82e1487b211754609882a0ce57d67d18`.
- Local integration evidence: `/Volumes/data/linka/audits/looks-integration-143-144-20261101/`. This contains the preservation inventory, full binary snapshot patch including untracked files, conflict diffs, commands, logs, JSON results and new screenshots. Historical snapshots are not rewritten.

## Conflict decisions and invariants

The real merge produced 21 conflicting paths, including add/add regression tests. The final integration keeps main's 3.3.1 version, license/notices, packaging and CI tooling, EyeLog override/provisioning and all locked dependency versions. Only the unused webfontloader and its types are removed from the main lock. The existing local MDI import replaces the duplicate render-blocking CDN stylesheet.

Fixed storage preserves immutable editor media and full ZIP entry names. Save creates a separate bounded, validated ZIP before destination rename; failed replacement cleans staging without mutating the editor source. Dirty snapshots are captured before awaiting save; edits during save remain dirty and block save-and-exit navigation. No schema migration is introduced. This is not a power-loss durability or race-proof filesystem guarantee.

The supported arrow modes remain `hidden`, `mouseOnly`, `mouseAndEyes`. Hidden removes arrows from DOM; mouse-only rejects gaze. Pause blocks ordinary cards and gaze paging but preserves specialist mouse paging and gaze-accessible resume; task/modal interlocks remain stronger. Output-off releases grid height while keeping pause/resume in the appbar. Geometry observers refresh the real gaze map after layout changes.

Existing main coverage is retained, including ZIP/network/resource safeguards, paragraph layout, telemetry polling, text-image completion instrumentation and native loading checks. Tests tied to superseded UI selectors are adapted to the new disclosure/save/exit UI. The old no-gaze-pause assertion is replaced by positive pause/resume and negative paused-output checks; activation feedback now clears after click. External unchanged input probes retain those two legacy assertion differences rather than disguising them as passing.

## Acceptance and limitations

Final-head evidence must be checked separately from the prior fixed snapshot's results: format, lint, typecheck, knip, build, full unit and full Electron E2E, symmetric C/D/R/S probes and both cross-import directions. Inspect actual new screenshots at desktop and 800×600, image-generation errors/retry and offline CDN startup. PR evidence records the exact tested SHA, counts, failures and CI URLs.

Physical Tobii/joystick, real voices and audible TTS, Windows/Linux human runtime acceptance, signing/update delivery, screen reader and specialist human QA remain unverified unless separately evidenced. Synthetic IPC/DOM/native-load checks do not prove hardware behavior. No release, tag or deployment is requested by this integration.
