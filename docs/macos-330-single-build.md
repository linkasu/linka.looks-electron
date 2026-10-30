# macOS 3.3.0: one build, runner-only snapshots

Application/tag stays `25a967bbefce93ff2e5dd17623cd10568b9dea76`.
Tooling baseline is `33676c23713117ee164529b9e9dfc7d4e2893813`.
The workflow records the exact checked-out tooling SHA, app SHA and tooling hashes
locally; the existing schema-v2 diagnostic records app/tooling provenance.

## Pinned public API and execution order

The authoritative API is `app-builder-lib@26.8.1/out/configuration.d.ts`,
`Hooks.afterPack` and `Hooks.afterSign` (both `Hook<AfterPackContext, void>`).
The npm tarball is SHA-512 pinned in the synthetic job, with no install scripts.
Its API comments specify `afterPack` before signing/distributables and `afterSign`
after signing but before distributables. Source checks and local execution cover:

```text
Packager.doBuild: x64, then arm64 (default concurrency = 1)
  MacPackager.pack → PlatformPackager.doPack
    installAppDependencies(platform, arch)                 once
    pack app / extraResources
    await emitAfterPack → unsigned snapshot for THIS arch
    sanityCheckPackage → fuses
    doSignAfterPack → MacPackager.signApp → sign
      await doSign → await notarizeIfProvided
    await emitAfterSign → signed snapshot for THIS arch
  packageInDistributableFormat
```

`MacPackager.pack` skips `doPack` for ordinary `prepackaged` input, so that route
does **not** replace normal signing/notarization. It is not used here.
`signApp` can return true even when `sign` skipped signing: `afterSign` is a
snapshot point, never signature evidence. Independent identity, codesign,
stapler and spctl gates remain mandatory.

`npm ci --ignore-scripts` avoids an additional host-architecture native rebuild
from root `postinstall` (and native dependency install scripts). Only the JS API
client, esbuild binary setup and Electron download lifecycle are replayed with
`npm rebuild pictures.bank-api esbuild electron`; none rebuild app native addons.
The existing EyeLog resource copier is invoked explicitly. Normal builder dependency rebuilds
remain enabled, once per architecture. No app source/config file is edited.
The external config retains every option from the immutable app's `build` field.

## Gates and disclosure

- Full bundles are copied with macOS `ditto` (including symlinks and xattrs)
  outside the app checkout/dist. Exclusive destinations reject duplicate hooks.
  `signed-rebuild` is only the legacy report stage name, not another build.
- Raw ASAR SHA-256 must match before/after. No header transformations, ignored
  checksum failures or JS payload exceptions are allowed.
- Every resource path, mode, link and non-Mach-O file must match exactly,
  including extraResources and unpacked files outside the ASAR header.
- Every recognized Mach-O resource, even unchanged, must have supported CPU
  slices/layouts. All file-backed sections, code and N_OSO hashes must match.
  Every signed slice must verify as Developer ID Application, team `29HEQ626X2`.
- Only disposable native copies undergo Apple's signature removal. Remaining
  bytes must match, including UUID, symbols, unknown bytes, load commands and FAT
  layout. One narrowly checked exception handles `codesign` retaining __LINKEDIT
  VM allocation: old allocation must derive from the original file size using
  CPU/16-KiB pages; signed allocation must derive from its original file size
  using 16-KiB pages. Other load-command differences block.
- App executable architecture, main bundle identity, deep codesign, stapler,
  spctl, packaged resources, both DMG/ZIP pairs and update metadata remain gated.
  Extracted ZIP resources must match the verified signed bundle exactly.
- Only the existing validated fixed-schema `diagnostic.json` can be uploaded,
  in this repository for three days. Installers, full snapshots, raw ASAR,
  paths and local provenance files are not uploaded. Diagnostic differences
  remain diagnostic, not equivalence approval; its conservative blocking flags
  are not rewritten to claim success.

## Local verification and limits

```sh
python3 scripts/ci/test-asar-evidence.py
python3 scripts/ci/test-report-asar-evidence.py
python3 scripts/ci/test-verify-macos-payload.py
node --test scripts/ci/macos-single-build.test.cjs
SIGNING_FIXTURE=node_modules/app-builder-lib/out/codeSign/macCodeSign.js node --test scripts/ci/backport-keychain-password.test.cjs
```

On macOS the Python suite compiles x64/arm64 dylibs, creates a universal dylib
and exercises real ad-hoc codesign/removal without identities or credentials.
Identity is mocked **only** in that fixture; the production gate rejects ad-hoc.
Mutation controls cover both slices, sections, unknown bytes, UUID/load commands,
CPU mismatch, malformed layout, wrong team and resource/ASAR changes.

For a local pinned-builder packaging integration test, set
`MACOS_BUILDER_INTEGRATION` to an existing unpacked Electron distribution when
running the Node suite. It runs real builder packing and hooks for both arch
contexts, with dependency work, signing and notarization mocked. The same local
Electron distribution is reused: this verifies orchestration, not real CPU
binaries or Electron native rebuilds. It never accesses signing secrets.

Real Developer ID signing/notarization, real application native rebuilding and
signed artifact generation have not been executed for this patch. Independent
review and separate approval precede any real signed workflow. The strict
normalizer intentionally blocks unsupported layouts, changed stripped FAT
offsets/padding or unexpected codesign behavior; it does not silently relax them.
Rollback is the tooling PR revert; neither app commit/tag nor release assets move.
