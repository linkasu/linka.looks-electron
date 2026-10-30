# 3.3.1 candidate retention and controlled promotion

## Current release contract (30 October 2026)

The owner explicitly authorized normal merge, CI signing/notarization and publication
of 3.3.1 after technical gates, accepting the disclosed SDK licensing/hardware limits.
The earlier approval blockers below are a historical record, not current gates.
PR127 was normally merged as `e000532772b7db2787a1244ba6c38b7cd628d377`.

| Entry                                        | Allowed behavior                                                                                   | Publication / resume                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| PR140 exact head                             | Unsigned Windows 2022 + both macOS builds; tests; inventories only                                 | No signing or release; latest exact-head gates must succeed                                                     |
| Main candidate dispatch                      | Explicit exact app/tooling SHAs; main ancestry; Windows 2022 once and macOS once per architecture  | Sign/notarize macOS with existing CI config; retain accepted bytes, sources/notices and hashes only after gates |
| Main promotion dispatch                      | Explicit successful candidate run + exact app/tooling SHAs; validate run/jobs and exact-head gates | Download only accepted bytes; recheck complete metadata/hashes; collision-refusing draft, never rebuild         |
| Authorized operator publishes verified draft | Recheck tag/app SHA, asset digests and provenance                                                  | `release.published` runs the existing production updater mirror; observe and verify it                          |
| Failed / partial / skipped required job      | Not accepted; keep failure evidence                                                                | No promotion, no automatic retry, overwrite or resume of an uncertain external action                           |

There is no v-tag build/publish trigger. v3.3.0 recovery remains untouched. Promotion
never approves a PR, enables automerge, bypasses protection or requests new credentials.
Concurrency does not cancel in-flight candidate/promotion work. Draft creation and
publication are separate observable operations; uncertain outcomes must be inspected,
not replayed. No persisted application data/state format changes in this stage.

Mandatory installers, blockmaps and updater metadata are validated before retention
and again before promotion: version 3.3.1, exact nonempty asset set, filenames,
SHA512 and sizes against actual bytes. Provenance binds app/tooling SHA and run ID
to SHA256/size of all files including source/notices bundles. Full signed-bundle
manifests (file hashes, modes and symlink targets) compare the accepted app to ZIP
and read-only DMG; expected architecture and team `29HEQ626X2` are checked. Strict
raw-ASAR and native normalization assertions are not weakened. Packaged-resource
assertions now run for every found Mac bundle, not just the first.

The source kit contains exact app/tooling git archives, exact node-eyelog/EyeLog
archives (including the EyeLog GPL documentation clarification), observed archive
hashes and preserved package/bundle notices. LICENSE and THIRD_PARTY_NOTICES.md
are included in actual packaging. This is not a complete proprietary Tobii source
offer or a claim of full license compatibility. Windows signature, physical Tobii,
full SDK runtime and actual installer-update remain NOT VERIFIED as disclosed.

### Retained E2E diagnosis and checks

Run `41059741668` at `4c45789` failed the 1-cell text-image style assertion on arm64.
The old trace contains no renderer/IPC settlement evidence: the underlying delay
is unconfirmed. Source proves that InputDialog closes immediately after emit while
CreateFromTextDialog awaits storage IPC; click completion is not generation completion.
The test-only observer now distinguishes pending/success/reject/null before the
unchanged 5-second style assertion, inside the unchanged 90-second overall budget.
Renderer snapshots/screenshots and scoped errors/timings are retained before closing.
Deferred/rejected/null controls pass; local text-image E2E passed both spans.
The first local observer attempt failed because Playwright TestInfo has no startTime;
it was corrected to a local budget start (Date.now elapsed), not a timeout
increase. This evidence does not retroactively prove a cause of the old CI delay.

## Historical build-only stage (superseded scope)

Signed main run `41069269720` completed the builder signing/notarization step and
raw-ASAR equality but failed the strict payload verifier; no macOS bytes were accepted.
Diagnostic tooling `98a1a3c` retained all assertions. Its first dispatch returned HTTP
500 and created no observed run during a 10-minute reconciliation; a single repeat
was explicitly authorized by the owner. Run `41073412620` rejected
`arch=x64, ordinal=406, stage=native-layout, supported=false`. This does not prove
the earlier FAT-alignment hypothesis. Windows artifact retention succeeded in both
runs; neither failed run may be promoted.

An independent real-FileMatcher regression proves USB compiler `.o/.obj` files from
`build/**/obj.target` were included as runtime resources. MH_OBJECT is intentionally
unsupported by the native gate, including when byte-identical. The packaging fix
excludes only that intermediate subtree and explicitly retains runtime bindings,
prebuilds, JavaScript and notices. Whether this is the sole signed-CI rejection cause
must be confirmed by the next exact-source signed candidate, not inferred from green
synthetic tests. Numeric file-type/geometry diagnostics are retained for that check.

At `3c148b4`, Checks, Electron test and full release acceptance succeeded.
Preflight `41065894582` passed macOS staging and Windows installer/metadata/notices
validation, then Windows GNU tar interpreted the absolute `D:` archive path as a
remote host. A regression reproduces rejection of that argument locally; staging
now passes a relative forward-slash output path. No asset or hash assertion changes.

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

At `f6248a03b7c2a1eb5a6f811b964917959bfe3bd6`, Checks, Electron test and the
old recovery workflow's **synthetic-only** PR job succeeded. Preflight
[41058445052](https://github.com/linkasu/linka.looks-electron/actions/runs/41058445052)
built macOS x64/arm64 installers and passed their packaged checks/inventory:
338 package metadata records, 283 notice files and 857 bundle entries per target.
Its downloaded inventory JSON hash is
`05cf18dc9223a397a725f2398fdc54c18defc283709ae026580a24fc0643490a`.
Windows built its installer and passed packaged resources, but nested ASAR lookup
failed because the Windows API requires native separators, not report-style `/`.
The follow-up keeps portable report paths while passing native paths to ASAR and
adds scoped, nested-package/notice fixtures.

Software acceptance
[41058445099](https://github.com/linkasu/linka.looks-electron/actions/runs/41058445099)
failed separately at a synthetic Windows supervisor timeout (`ETIMEDOUT`, 40-second
outer deadline, no supervisor output), before the real SDK launch step. The exact
substage/root cause is unconfirmed. No deadline, containment rule, classification
or assertion is changed; a later green run cannot erase this observed failure.
