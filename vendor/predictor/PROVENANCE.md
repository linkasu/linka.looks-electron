# Predictor source snapshot

Upstream: https://github.com/linkasu/linka.predictor-rust/pull/1
Commit: `a83c727b4497471740b4ee31ad0ba0a46ea39633`.
The unpublished `@linkasu/predictor-electron` TypeScript entry is vendored because
there is no immutable published npm artifact. Only formatting is changed.
`LICENSE` and `docs/electron-api.md` are copied from that same commit. No upstream
PR is duplicated or changed. The main bundle compiles this entry; the isolated
renderer imports types only, never the process-owning implementation.

The sidecar and approved immutable production model must be provisioned separately
as `predictor-resources/lp-electron[.exe]` and `predictor-resources/model.lpk`, with
`LICENSE` and `MODEL_NOTICE.md`. Electron Builder copies them outside ASAR.
The tiny synthetic upstream model is suitable for tests only, not production.
