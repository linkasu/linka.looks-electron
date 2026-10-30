# Security candidate 3.3.1 — issue #139

This is a draft candidate, **not release approval**. No tag, installer publication,
release, deployment or merge is part of this change. The immutable v3.3.0 tag and
macOS signing-recovery workflow are unchanged. Features #128 and #129 remain in
the main ancestry; #130 and unrelated PRs are not included.

## Sources and versions

Base: `2068c947ccba104110e7509166d62fecb7abca8e`. The base package/lock blobs are
`22820131a9191fdf0e9c3e13e30261cecfd10310` /
`55a15db41af8bc5e22a2f3c3fc31bc486ccbcd87`.

Remote branches/tags, authenticated releases (including drafts) and local version
history were checked on 2026-10-30: 3.3.1 was unoccupied. v3.3.0 already exists
and has a separate draft release; neither was changed.

| Dependency                              | Candidate      | Reason                                                                                                                                                                 |
| --------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron                                | 43.8.4         | Smallest supported major after EOL 42; contains the 43.8.1 TLS mitigation                                                                                              |
| adm-zip                                 | 0.6.1          | Bounded inflation, including zero-size headers, malformed async input and duplicate-name fixes                                                                         |
| axios                                   | 1.20.0         | Security fixes without a major upgrade                                                                                                                                 |
| follow-redirects / form-data            | 1.16.2 / 4.0.6 | Updated within existing dependency ranges                                                                                                                              |
| electron-updater / builder-util-runtime | 6.8.9 / 9.7.0  | Fixed redirect credential policy                                                                                                                                       |
| electron-builder family                 | 26.16.1        | Official family: app-builder-lib/dmg-builder 26.16.1, builder-util/electron-publish 26.16.0, runtime 9.7.0; fixes keychain-password separation and AppImage generation |
| tar                                     | 7.5.22         | Covers the required 7.5.21 fixes; no major override                                                                                                                    |
| Vite                                    | 7.3.7          | Fixes exposed development-server/editor paths; no Vite major upgrade                                                                                                   |

Primary sources:
[Electron 42 EOL](https://github.com/electron/electron/releases/tag/v42.11.18),
[43.8.1 mitigation](https://github.com/electron/electron/releases/tag/v43.8.1),
[43.8.4 notes](https://github.com/electron/electron/releases/tag/v43.8.4),
[TLS advisory](https://github.com/advisories/GHSA-jr5w-w6x2-84p9),
[AppImage advisory](https://github.com/advisories/GHSA-7g7r-gx96-252g),
[original issue and source links](https://github.com/linkasu/linka.looks-electron/issues/139).
PR #116 was confirmed closed and unmerged; it was not reopened.

The installed Tobii 0.2.16 package declares Electron `>=39` and uses a Node-API
addon plus USB prebuilds. This makes 43 a smaller compatibility step than 44/45,
not proof of hardware compatibility. Build-time Node remains 22.22.2/npm 10.9.7;
Electron 43.8.4 embeds Node 24.22.1. Load checks must use Electron too.

## ZIP invariant and compatibility

All production adm-zip readers now enter through `openLinkaZip`: config/media
reads, import, merge, cleanup/save, downloaded-set extraction and appendZip.
The format/schema is unchanged. Valid legacy configurations still normalize as
before. The existing 500 MiB output / 2,000-entry limits are retained; compressed
input is now bounded to 500 MiB too. Generated parent directories count toward
the entry limit.

Metadata is checked before inflation. adm-zip 0.6.1 caps DEFLATE output at the
declared length, with a one-byte floor for zero declarations. STORED data is
bounded by its compressed extent. Every actual output length is verified, so
neither zero nor false sizes bypass the aggregate limit. Unsupported/encrypted
entries, traversal, Windows path aliases/devices, links/special files, duplicate
names and Unicode/case aliases are rejected. Extraction refuses existing target
symlinks, including dangling links. Ordinary append writes still replace the
source only after the temporary output has passed validation.

Intentional restriction: ambiguous or unsafe archives previously accepted are
now rejected. Reading validates all entries, so opening a large legitimate set
does more work than reading only config.json. These are resource bounds, not a
promise that a 500 MiB archive uses only 500 MiB of process memory. Local concurrent
filesystem mutation is not treated as a sandbox boundary; no claim of race-proof
extraction against another process controlling the destination is made.

Regression fixtures use kilobytes, not multi-GB bombs: legacy read/edit/save,
merge collisions, malformed/truncated ZIPs, zero/false DEFLATE and STORED sizes,
aggregate-size/count caps, path aliases, links, duplicates, extraction and failure
without replacing existing archives. Network tests use loopback only: axios
proxy + NO_PROXY redirects and redirect-loop limits, HTTPS with an ephemeral
fixture CA scoped to one HTTPS Agent, rejection of a wrong hostname and of the
same chain without fixture trust, and updater redirect credential stripping
(mock request options). OpenSSL on PATH generates short-lived fixture keys in a
temporary directory, removed after the test; knip lists this external test binary
explicitly. No system trust or TLS validation setting is changed. These do **not**
claim a real installer update or a reproduced compromised-CA/blocklist attack.

A 266-byte before/after reproduction was executed with the original adm-zip
0.5.10 installed in isolated scratch using ignore-scripts: baseline
getConfigFile's readAsText path accepts a ZIP whose nonempty media declares size
zero; the candidate's shared reader rejects that same file. adm-zip 0.6.1 now
ships its own types, so the obsolete @types/adm-zip dependency was removed after
knip identified it (rather than adding a lint/knip exception).

## Reproducible audit evidence

All JSON files here are complete reports, formatted with repository Prettier.
They are not allowlists. Audit exited **1**, not 0, for every report.

| Report                                  | Critical | High | Moderate | Low | Total package records |
| --------------------------------------- | -------- | ---- | -------- | --- | --------------------- |
| Supplied Node 24/npm 11 baseline        | 2        | 28   | 7        | 1   | 38                    |
| Reproduced Node 22/npm 10 baseline, all | 2        | 30   | 7        | 1   | 40                    |
| Reproduced baseline, omit=dev           | 2        | 17   | 2        | 0   | 21                    |
| Previous candidate f7dd3541, all        | 1        | 2    | 7        | 1   | 11                    |
| Previous candidate f7dd3541, omit=dev   | 1        | 2    | 2        | 0   | 5                     |
| Current candidate, all                  | 0        | 2    | 5        | 1   | 8                     |
| Current candidate, omit=dev             | 0        | 2    | 0        | 0   | 2                     |

Before using the supplied gzip, its decoded bytes matched SHA256
`0bd711cc7d87dd6ae9d8202892a96ac1251021f35b15503def1683bb6190d733`.
Formatting the checked-in JSON changes its byte hash, not its contents.
Comparing both baseline reports finds **the same 147 unique advisory URLs**:
npm 10 additionally propagates high severity to `tmp-promise` and
`@malept/flatpak-bundler`. The difference is package/metavulnerability reporting,
not two additional demonstrated exploits. Omit=dev counts match.

Reproduce with project Node/npm and the appropriate exact lockfile:

```sh
npm audit --package-lock-only --ignore-scripts --json --registry=https://registry.npmjs.org
npm audit --package-lock-only --ignore-scripts --omit=dev --json --registry=https://registry.npmjs.org
```

No Dependabot endpoint, force audit fix, broad exception or alternate credential
was used. A multi-package `npm update` hit npm 10's `edgesOut` null error; targeted
updates and an explicit same-major Vite install succeeded. `npm ci
--ignore-scripts` subsequently resolved the lock successfully.

## Reachability and residual risk

| Package/path                                                               | Conditions, limitation and decision                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fixed install path: Tobii → eyelog 1.1.5 → @xhmikosr/decompress 11.1.4** | Exact reviewed git override `b1200c685fc11337e3eec1dda12045b2fdc99d3f`; npm 10 install and fresh ordinary npm ci resolved that SHA and removed the old decompress graph. Checksum/size precede dynamic ESM import and parsing; flat regular-file allowlist, exclusive staging/lock and fail-closed replacement. Native/Tobii API unchanged. Public-byte pin is not a manufacturer signature or an immutable release. See integration evidence below.         |
| **High: vue 3.5.34 → @vue/server-renderer 3.5.34**                         | GHSA-g2v6-rqmx-r4w6 requires SSR with attacker-controlled attribute names containing CR. The app mounts with createApp; no createSSRApp/renderToString/server-renderer source entry exists. @vue/test-utils also brings the renderer but tests use local fixtures. Not demonstrated in the installed app. Keep these two package records visible; update Vue and its coherent compiler/renderer family to >=3.5.42 before adding SSR/untrusted SSR fixtures. |
| Electron HTTPS                                                             | Reachable from image/TTS/notifications/update requests; an intercepting attacker plus a compromised-chain certificate is required. Patched 43.8.4, not an app-side TLS bypass/workaround.                                                                                                                                                                                                                                                                    |
| adm-zip / CardsStorage / appendZip                                         | User-imported .linka files are a real runtime trust boundary. Patched and all readers guarded; not classified as build-only.                                                                                                                                                                                                                                                                                                                                 |
| axios → follow-redirects / form-data                                       | Node adapter proxy + NO_PROXY + redirect conditions were relevant. Fixed and locally tested. No application path proving attacker-controlled prototype-pollution merge, HTTP/2 or data-URL exploitation was identified.                                                                                                                                                                                                                                      |
| electron-updater → builder-util-runtime                                    | Cross-origin redirect credential disclosure needs affected credential headers. Current main config sets a public feed, without requestHeaders; public availability alone is not evidence of credentials. Fixed defensively; policy regression tested with fixture headers only.                                                                                                                                                                              |
| node-gyp / cacache / app-builder-lib → tar                                 | Install/build parsing and archive DoS, not a found src runtime tar call. All installed paths use 7.5.22.                                                                                                                                                                                                                                                                                                                                                     |
| app-builder-lib AppImage                                                   | A defect in the produced Linux artifact, not just a development-server issue and not this macOS artifact. Fixed by the official 26.16.1 family; Linux packaging itself is not claimed tested.                                                                                                                                                                                                                                                                |
| Vite → launch-editor                                                       | Development server exposure can disclose files/credentials or launch an editor with malicious arguments; production frontend assets are not a Vite server. Patched in 7.3.7; development machines are not assumed harmless.                                                                                                                                                                                                                                  |
| Electron → extract-zip                                                     | Official artifact extraction/install trust boundary. Electron 43 uses @electron-internal/extract-zip 1.0.8; the old extract-zip package is absent. Artifacts retain upstream checksum validation.                                                                                                                                                                                                                                                            |
| app-builder-lib → plist → @xmldom/xmldom                                   | Build-time plist/XML parsing, not an application XML import. Updated to 0.8.15 with builder.                                                                                                                                                                                                                                                                                                                                                                 |
| minimatch/archiver/tooling → brace-expansion                               | Adversarial glob expansion can consume CPU/memory. Updated in existing 1.x/2.x/5.x ranges to 1.1.21/2.1.7/5.0.12; no major override.                                                                                                                                                                                                                                                                                                                         |
| electron-store → conf → ajv → fast-uri                                     | URI normalization advisories need use of normalized attacker input as a network trust decision. No such src decision identified; schema parsing remains real. Patched to 3.1.9.                                                                                                                                                                                                                                                                              |
| node-gyp → make-fetch-happen → socks → ip-address                          | Proxy/address parsing during native builds, not a found runtime address allowlist. Patched to 10.7.5.                                                                                                                                                                                                                                                                                                                                                        |
| Vite/PostCSS → nanoid                                                      | Advisories require attacker-controlled generator size/custom generator; app uses uuid, not these APIs. Patched transitive nanoid to 3.3.20.                                                                                                                                                                                                                                                                                                                  |
| Vite/Vue compiler → postcss / source-map-js                                | CSS/source-map auto-loading and indexed-map parsing matter for malicious build inputs, not just prod graph labels. Patched to 8.5.32/1.2.2.                                                                                                                                                                                                                                                                                                                  |
| builder → flatpak-bundler → tmp-promise → tmp                              | Build filesystem/temp-file attacks. Patched to tmp 0.2.7.                                                                                                                                                                                                                                                                                                                                                                                                    |
| Electron → @electron/get → undici                                          | Install/download HTTP client; SOCKS/cache/WebSocket/TLS conditions differ per advisory, and these are not automatically src runtime requests. Patched to 7.30.1. Electron's embedded undici is a separate runtime supplied with Electron.                                                                                                                                                                                                                    |
| jsdom → ws                                                                 | Test WebSocket transport; malicious frames require an actual peer. Patched to 8.22.0.                                                                                                                                                                                                                                                                                                                                                                        |
| knip → zod                                                                 | Oversized constrained collection validation would require untrusted tool inputs. Patched to 4.6.7.                                                                                                                                                                                                                                                                                                                                                           |

Other remaining records are moderate tooling advisories in Vitest/mocker/coverage,
postcss-selector-parser and smol-toml, plus low esbuild dev-server exposure. Tests
and tooling use repository-owned inputs; do not expose their dev servers to
untrusted clients. They are visible in candidate-all.json, not silently accepted
by a new audit gate. The former Tobii/eyelog propagated records are now absent.

### Reviewed upstream integration

The old app resolved `de5496917948b2ae881827e9caa32763391ddd74` despite Tobii's
`#41e8280` declaration. That installer used decompress 4.2.1 and SDK 1.1.1.0
without its own checksum. It was not re-enabled.

The independent writer delivered [node-eyelog PR #2](https://github.com/linkasu/node-eyelog/pull/2).
Reviewed base `f6538f61af0cb0a532d1271a075c6ff47dfcc180`, installer/tests and final
delta at **`b1200c685fc11337e3eec1dda12045b2fdc99d3f`**. Exact-head Windows and
Ubuntu Node 22.22.2 checks both succeeded in runs
[41043088489](https://github.com/linkasu/node-eyelog/actions/runs/41043088489) and
[41043079933](https://github.com/linkasu/node-eyelog/actions/runs/41043079933).
The final delta closes the Windows sharing-test helper before fixture cleanup;
no blanket skip/retry replaced that control. No upstream repository was edited
by this app writer, and no package publication was needed.

`overrides.eyelog` uses the exact git SHA. npm 10.9.7 actually switched the locked
and installed package to 1.1.5 at that SHA; `npm ls` shows only the fixed fork
11.1.4, not the old decompress packages. npm reports git dependencies as SSH
resolutions and warns about skipping registry integrity verification; the lock
retains the exact commit and packed integrity. This is not a registry-signature claim.

Ordinary `npm ci` (scripts enabled) passed locally on Node 22.22.2/npm 10.9.7:
the reviewed upstream postinstall plus app provisioning ran, followed by builder
26.16.1 native dependency preparation. No downloaded executable was run.
App postinstall and preelectron:build call `scripts/ci/provision-eyelog.cjs`:
it verifies the lock SHA and SDK pin, invokes the reviewed installer, then copies
required binaries from the actual resolved dependency to Tobii's resource directory.
This is needed because the unchanged Tobii 0.2.16 copier assumes a nested eyelog
directory, while npm 10 hoists the override. Candidate CI invokes the same script
after its explicit selective rebuild; ignore-scripts is not the fix.
Five local negative/positive controls cover lock drift, digest drift, installer
failure and missing resources without publishing paths/errors.
The packaged resource gate compares all five SDK files byte-for-byte against this
provisioning on Windows and macOS. Its five synthetic controls reject missing,
non-file, stale and empty payloads. It no longer launches EyeLog.exe or treats a
Tobii startup exception as success; physical runtime acceptance remains separate.

The retained upstream SDK **1.1.3.0** is a real delta from the old app's 1.1.1.0:
raw gaze plus invariant-culture output. Asset 467473707 is 389225 bytes, pinned
SHA256 `7d97bf05faf5688f7cabe79acdfbd78696ca989e86efb9a9e90bf301e2595d2d`.
The installed upstream's offline suite passed 10 tests / 1 Windows-only skip on
macOS; public provisioning passed and checked all five nonempty binaries.
A consumer fixture executes the installed parser and unchanged Tobii adapter with
mocked Windows spawn: `--raw`, split CRLF frames, invariant/legacy decimal input,
nonfinite rejection, scale conversion, bounds/timeout and enter/click/exit events.
This proves only protocol compatibility for those fixtures, not physical gaze.

Upstream main also already changed **ISC → GPL-3.0-or-later** relative to the old
app pin. Licenses/notices are not changed or reverted here. **Binary-distribution
licensing review remains unresolved**; no full legal compatibility is asserted.
The installer uses a two-step swap, not a crash-atomic whole-directory replacement;
stop consumers during install. Rollback/cleanup errors fail closed, stale-lock or
power-loss recovery is manual. SDK extraction is bounded by a pre-parser digest
pin, not a general streaming bomb defense.

### Builder compatibility (unsigned/synthetic only)

Official app-builder-lib 26.16.1 lock integrity matches
`sha512-FhaO6YOup01ZfQW0Z6gt3AyukJjv1gW4uFK47jTgwcHZKqyN/fSlK2LqPf9tAeZYLP2bRJLDzeOkRImsw2X4Pg==`.
Unlike 26.15.0, `importCerts` receives the generated keychain password for
`set-key-partition-list -k`; certificate passwords remain exclusive to import -P.
The VM fixture executes the installed official module with all I/O mocked, using
different app/installer passwords, plus mutation controls that must fail.
The old exact-version/hash 26.8.1 backport and recovery workflow are untouched.

Installed-source sign fixtures cover the new `(appPath, options, arch, isMas)`
signature, awaited signing/notarization, failure and no-identity behavior; MAS must
not notarize. The real builder synthetic packaging fixture records exactly one
dependency phase, afterPack, mock sign/notarize and afterSign per architecture label.
It uses the local Electron distribution for both fixture labels, **not** proof of
both machine architectures or genuine signing. Snapshot hooks reject MAS because
the candidate only targets darwin, and reject duplicate/missing/unsupported stages.
No runtime hook change was necessary. Strict payload verifier is unchanged;
41 synthetic evidence/payload tests passed locally. The optional local ad-hoc
signing test was deliberately not run. No diagnostics were added, so no new
diagnostic schema/disclosure surface exists.

Old run 41033267787 proved raw-ASAR equality and notarization for the old app,
but failed strict payload verification. Its exact substage remains unknown;
FAT alignment remains only a hypothesis. Neither its gate nor the current strict
comparisons were weakened. New signed acceptance is still required separately.

### Local iteration results (Node 22.22.2 / npm 10.9.7)

- Format/lint/typecheck/knip passed; unit **223 passed / 1 skipped**; build passed
  (existing large frontend chunk warning remains).
- **20** builder/provisioning/protocol/resource synthetic checks passed, including
  real-builder mock-sign integration. Strict evidence/payload synthetic suite:
  **41 passed**, with the optional ad-hoc signing case intentionally excluded.
- Full E2E **20/20 passed** (162s); packaged E2E **2/2 passed** (19s).
  macOS arm64 packaging explicitly set `mac.identity=null`: builder reported
  skipped code signing. Packaged resource equality passed; target Electron and
  packaged executable both loaded Tobii Node-API and USB without listing devices.
- An earlier full-E2E shell invocation was interrupted at its 120s command budget;
  it is not a passing suite or proof of a product failure. Saved trace showed a
  test awaiting `.root` when the channel was closed. Its orphan Vite process was
  stopped before the fresh completed run; assertions/timeouts/retries were not changed.
- Previous head f7dd3541's arm64 text-image failure remains unexplained. Current
  successful local text-image coverage is not proof that this flake was fixed.
  Candidate CI now retains failure traces without retry/ignore changes.
- npm audit all and omit=dev both still exit **1**, with the counts above. A helper
  initially tried to store the exit code in zsh's reserved `status` variable;
  the fresh final audit commands use `result` and explicitly preserve exit 1.
- A first generic unittest discovery command discovered zero hyphenated test
  modules (exit 5); the explicit synthetic suite above actually ran 41 tests.
- Signed/notarized candidate, compromised-CA attack reproduction, actual installer
  update, physical Tobii/calibration/gaze and Linux packaging are **not run**.
  Terminal exact-head cross-platform CI is recorded in PR #140, not inferred here.

## Verification boundaries

Local and exact-head CI results are recorded in the draft PR. In particular:

- Physical Tobii, live calibration/gaze and a real installer update are **never run**.
- Native module build/load without hardware is not a physical Tobii pass.
- Windows EyeLog must use the reviewed pinned lifecycle/provisioner. A missing binary
  must fail the existing resource/provisioning check; do not suppress that failure.
- PR macOS checks cover both packaging architectures; their conclusions must be
  checked for the exact pushed head before promoting the draft.
- The three arrow settings/restart E2E tests now allow 60s, since they contain two
  launches whose first usable window each has a 20s wait. Initial default-budget
  runs failed 3/3 at 30s; traces showed the first root at 18–19s and the second
  root still pending. The same assertions passed 3/3 with the scoped budget.
- Initial exact-head CI passed Checks and both macOS architecture jobs. Windows
  failed native compilation: the windows-latest image was windows-2025-vs2026,
  while the installed node-gyp 11 finder only recognizes VS2019/2022. Candidate
  Windows jobs are pinned to windows-2022 instead of adding a native-toolchain
  major upgrade; historical baseline/PR121 jobs and signing recovery are unchanged.
- macos-330-signing-recovery.yml and run 41033267787 are not changed, cancelled or
  repurposed. Ordinary release/update/publish workflows are not dispatched.
