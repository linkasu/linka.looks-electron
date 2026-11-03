# Predictor source snapshot

Upstream: https://github.com/linkasu/linka.predictor-rust/pull/1
Commit: `ec07b2cd49c1c2c684e6643f0dab75cf5895ebca`.
The unpublished `@linkasu/predictor-electron` TypeScript entry is vendored because
there is no immutable published npm artifact. Only formatting is changed.
`LICENSE` and `docs/electron-api.md` are copied from that same commit. No upstream
PR is duplicated or changed. The main bundle compiles this entry; the isolated
renderer imports types only, never the process-owning implementation.

The sidecar and approved immutable production model must be provisioned separately
as `predictor-resources/lp-electron[.exe]` and `predictor-resources/model.lpk`, with
`LICENSE` and `MODEL_NOTICE.md`. Electron Builder copies them outside ASAR.
The tiny synthetic upstream model is suitable for tests only, not production.
