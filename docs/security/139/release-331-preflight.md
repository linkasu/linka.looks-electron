# 3.3.1 build-only release preflight

This stage continues draft PR140, not a second release/tooling PR. The starting
application SHA is `50ded57808f80abd4ca13021fa20fa75c2059581`; the package and lock
blobs remain `7807769d1769a7d4674a7fdc136457391756aec8` and
`1c1f959d6f339b63263b6c2d0bb6f55a0271a054`. No dependencies, licensing decisions,
application features, v3.3.0 recovery code or strict payload assertions change.

## Execution matrix

| Entry                             | App / tooling source                                                          | Execution                                                                                                     | Disclosure                            |
| --------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| PR140 synchronize                 | Exact PR head / same exact head (not the synthetic merge commit)              | Windows **2022**, x64 installer; macOS x64/arm64 DMG+ZIP; one real build per architecture; no signing secrets | JSON inventory only, never installers |
| Manual dispatch, workflow on main | Exact input app SHA, validated as main ancestor / exact workflow `github.sha` | macOS x64/arm64, one build per architecture, normal CI signing/notarization                                   | JSON inventory only, never installers |
| Tag or release event              | Not supported by this workflow                                                | None                                                                                                          | None                                  |

The workflow has `contents: read`, non-persisted checkout credentials, no publishing
token, no package publication, no production mirror access and no automatic
signed execution. Existing signing credentials are referenced only by the normal
CI build step. No secret values are read/exported by the agent. A synthetic test
uses the real **26.16.1** builder with mocked signing, not real identities.

The signed path preserves raw-ASAR hashes across hooks, strict native full-byte
normalization/resource equivalence, Developer ID team identity, architecture,
Gatekeeper and stapling checks. ZIP extraction and read-only DMG mounting must
preserve resources and pass signature/stapling/Gatekeeper checks too. Any failure
blocks the job. The verifier is unchanged and still fails generically without
publishing raw paths, subprocess stderr or payload bytes. No FAT-alignment
exception or old 26.8.1 keychain backport is applied.

## Source and notices evidence

`release-inventory.cjs` inventories actual ASAR package metadata and the entire
unpacked bundle (including Electron framework/runtime files, native modules,
external SDK resources and existing license/notice files). It records relative
paths, file hashes, package metadata, exact lock resolutions/integrities, SDK pin,
installer hashes and app/tooling SHAs. **Metadata is not a license grant.**

On each runner, `release-evidence/` additionally holds byte-preserving copies of
existing notices and `app-source.tar` / `tooling-source.tar`, made with `git archive`
at the recorded commits. These include tracked build/install/workflow scripts.
Only `inventory.json` is uploaded; source archives, notices and binaries remain on
the ephemeral runner. Reproduce locally with clean, isolated exact checkouts,
the locked Node 22.22.2/npm 10.9.7 toolchain and the same build commands; then set
`APP_SHA` / `TOOLING_SHA` and run `node scripts/ci/release-inventory.cjs`.
Existing output refuses notice-file overwrite, so use a fresh evidence directory.

This is a **source/notices staging kit**, not a complete corresponding-source offer.
Third-party source retrieval, completeness, licenses for fonts/default sets and
Electron/Chromium notices still need review against the actual JSON inventory.
Exact known upstream pins:

- node-eyelog: `b1200c685fc11337e3eec1dda12045b2fdc99d3f`, GPL-3.0-or-later
  metadata inherited from upstream base; no upstream API/package publication.
- Tobii wrapper: locked 0.2.16 tarball and its lock integrity, not an invented
  source commit. Source provenance/completeness must be supplied/verified.
- SDK source: `linkasu/EyeLog` tag `1.1.3.0` resolved read-only on 2026-10-30 to
  `565dbbbb300925396a7adb5aa9d630fee32502b9`. This source pin alone does not
  establish a reproducible correspondence to the DLLs.
- SDK binary asset `467473707`, 389225 bytes, SHA256
  `7d97bf05faf5688f7cabe79acdfbd78696ca989e86efb9a9e90bf301e2595d2d`.
  It contains EyeLog.exe and Tobii.EyeX.Client / Tobii.Interaction.Net /
  Tobii.Interaction.Model DLLs. The checksum is not a vendor signature or rights grant.

Read-only source staging also downloaded the two exact public GitHub source
archives locally under ignored `release-evidence/upstream-source/`, without
extracting or executing them. Bounded archive listing rejected absolute/traversal
names. The SDK source contains C# project/source and its build workflow; node-eyelog
contains its installer, tests, lockfile and build sources. Neither establishes
complete corresponding source or redistribution rights for the Tobii DLLs.

| Exact source archive                                   | Bytes | Downloaded archive SHA256                                          |
| ------------------------------------------------------ | ----: | ------------------------------------------------------------------ |
| EyeLog `565dbbbb300925396a7adb5aa9d630fee32502b9`      | 20283 | `15d8660020393b3d7ac9d5941ed1a442b6e1e5a6931d677765c05ad8a5e36231` |
| node-eyelog `b1200c685fc11337e3eec1dda12045b2fdc99d3f` | 33376 | `6f4430c8c0cb972b75c5477f99f91c602606b25fe32b8ec026d56ce3697d283d` |

These are observed archive hashes, not upstream signatures or a promise that
GitHub-generated gzip bytes will never change. Commits remain the source pins.

## Required sequence and publication blockers

1. Commit/push only to existing PR140; keep draft. Follow all **new exact-head**
   checks to terminal state. Old head greens do not approve this diff.
2. Resolve app rightsholder/license decision and third-party compatibility.
   App has no LICENSE/notices/package license; PR127 remains open and unmerged.
   SDK GPLv3 LICENSE vs README MIT/missing LICENSE.md is unresolved. Obtain exact
   rights/provenance for the three Tobii DLLs. Do not select GPL/MIT or substitute
   a disclaimer for missing rights. Reviewer's independent work is not an approval.
3. Obtain an explicit, gate-aware decision allowing PR140 readiness/merge through
   normal branch protection. **No merge/Approve/automerge is performed here.**
   Until this workflow exists on main and the app SHA is in main history, signed
   dispatch is intentionally unavailable. Do not use a tag as a dispatch bypass.
4. With that decision and exact source/tooling SHAs, dispatch the new build-only
   workflow on main. Observe terminal success; genuine signing/notarization and
   strict payload checks are prerequisites, not predicted results.
5. Complete physical Tobii/calibration/gaze, full SDK runtime and actual installer
   update acceptance on these artifacts. Hosted Windows missing-VC110 classification
   and the owner's earlier “checked” do not establish those results. Windows signing
   is not configured/proven by this macOS signed job. Linux is outside this stage.
6. Before **any** release/tag publication, recheck live remote, draft state, exact
   accepted SHAs, tag/release collisions and all gates. The old `electron.yml`
   still triggers rebuild/`-p always` on v-tags: it must be deliberately replaced
   by a reviewed promotion-of-accepted-artifacts path before tagging 3.3.1.
   `release.published` triggers the production updater mirror. No dispatch,
   publication or mirror change is authorized by a green preflight alone.

The independent safe build path is ready for CI; release publication remains
blocked by the above decisions/evidence and the old tag-publish path. v3.3.0's
tag and old draft release must not be moved or published.

## Retained first-attempt failure

At `5a6b6b01227ec3aeb4cceb35ed90e3674befaa5a`, Checks
[41056781659](https://github.com/linkasu/linka.looks-electron/actions/runs/41056781659)
and software acceptance
[41056781177](https://github.com/linkasu/linka.looks-electron/actions/runs/41056781177)
succeeded, but preflight
[41056781427](https://github.com/linkasu/linka.looks-electron/actions/runs/41056781427)
failed before installers were built. Windows ASAR listing uses backslashes; the
inventory stripped only a leading slash. macOS mock integration lacked its explicit
Electron distribution: Electron 43's package has no postinstall, so rebuilding the
package does not install that distribution. The follow-up normalizes ASAR paths
and explicitly invokes the official checksum-verifying Electron installer before
the mock test. Both regressions were reproduced red locally, then passed after
the fix; the Windows-style listing control runs on all hosts. No retry/skip or
feature/payload assertion relaxation replaces either failure.
