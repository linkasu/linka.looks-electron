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

| Dependency                              | Candidate      | Reason                                                                                                                   |
| --------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Electron                                | 43.8.4         | Smallest supported major after EOL 42; contains the 43.8.1 TLS mitigation                                                |
| adm-zip                                 | 0.6.1          | Bounded inflation, including zero-size headers, malformed async input and duplicate-name fixes                           |
| axios                                   | 1.20.0         | Security fixes without a major upgrade                                                                                   |
| follow-redirects / form-data            | 1.16.2 / 4.0.6 | Updated within existing dependency ranges                                                                                |
| electron-updater / builder-util-runtime | 6.8.9 / 9.7.0  | Fixed redirect credential policy                                                                                         |
| electron-builder family                 | 26.15.0        | Coherent builder, app-builder-lib, builder-util, dmg-builder, publisher and squirrel versions; fixed AppImage generation |
| tar                                     | 7.5.22         | Covers the required 7.5.21 fixes; no major override                                                                      |
| Vite                                    | 7.3.7          | Fixes exposed development-server/editor paths; no Vite major upgrade                                                     |

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
proxy + NO_PROXY redirects and redirect-loop limits, failed HTTPS identity, and
updater redirect credential stripping (mock request options). No TLS validation
is disabled. These do **not** claim a real installer update or a successful
end-to-end TLS certificate-blocklist interception test.

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
| Candidate, all                          | 1        | 2    | 7        | 1   | 11                    |
| Candidate, omit=dev                     | 1        | 2    | 2        | 0   | 5                     |

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

| Package/path                                          | Conditions, limitation and decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical: Tobii → eyelog 1.1.2 → decompress 4.2.1** | `eyelog/download.js` runs extraction in postinstall. A malicious/compromised Release.zip can escape via links/hardlinks; no ordinary src runtime call to decompress was found. Ordinary npm ci remains unsafe. PR CI now uses ignore-scripts plus explicitly reviewed pictures.bank-api/esbuild/electron preparation; it does not run EyeLog download.js. This is containment, not a dependency fix or permanent exception. **Release blocker: approved upstream fix and checksum-pinned binary provisioning.** |
| **High: vue 3.5.34 → @vue/server-renderer 3.5.34**    | GHSA-g2v6-rqmx-r4w6 requires SSR with attacker-controlled attribute names containing CR. The app mounts with createApp; no createSSRApp/renderToString/server-renderer source entry exists. @vue/test-utils also brings the renderer but tests use local fixtures. Not demonstrated in the installed app. Keep these two package records visible; update Vue and its coherent compiler/renderer family to >=3.5.42 before adding SSR/untrusted SSR fixtures.                                                    |
| Electron HTTPS                                        | Reachable from image/TTS/notifications/update requests; an intercepting attacker plus a compromised-chain certificate is required. Patched 43.8.4, not an app-side TLS bypass/workaround.                                                                                                                                                                                                                                                                                                                       |
| adm-zip / CardsStorage / appendZip                    | User-imported .linka files are a real runtime trust boundary. Patched and all readers guarded; not classified as build-only.                                                                                                                                                                                                                                                                                                                                                                                    |
| axios → follow-redirects / form-data                  | Node adapter proxy + NO_PROXY + redirect conditions were relevant. Fixed and locally tested. No application path proving attacker-controlled prototype-pollution merge, HTTP/2 or data-URL exploitation was identified.                                                                                                                                                                                                                                                                                         |
| electron-updater → builder-util-runtime               | Cross-origin redirect credential disclosure needs affected credential headers. Current main config sets a public feed, without requestHeaders; public availability alone is not evidence of credentials. Fixed defensively; policy regression tested with fixture headers only.                                                                                                                                                                                                                                 |
| node-gyp / cacache / app-builder-lib → tar            | Install/build parsing and archive DoS, not a found src runtime tar call. All installed paths use 7.5.22.                                                                                                                                                                                                                                                                                                                                                                                                        |
| app-builder-lib AppImage                              | A defect in the produced Linux artifact, not just a development-server issue and not this macOS artifact. Fixed by coherent 26.15.0 family; Linux packaging itself is not claimed tested.                                                                                                                                                                                                                                                                                                                       |
| Vite → launch-editor                                  | Development server exposure can disclose files/credentials or launch an editor with malicious arguments; production frontend assets are not a Vite server. Patched in 7.3.7; development machines are not assumed harmless.                                                                                                                                                                                                                                                                                     |
| Electron → extract-zip                                | Official artifact extraction/install trust boundary. Electron 43 uses @electron-internal/extract-zip 1.0.8; the old extract-zip package is absent. Artifacts retain upstream checksum validation.                                                                                                                                                                                                                                                                                                               |
| app-builder-lib → plist → @xmldom/xmldom              | Build-time plist/XML parsing, not an application XML import. Updated to 0.8.15 with builder.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| minimatch/archiver/tooling → brace-expansion          | Adversarial glob expansion can consume CPU/memory. Updated in existing 1.x/2.x/5.x ranges to 1.1.21/2.1.7/5.0.12; no major override.                                                                                                                                                                                                                                                                                                                                                                            |
| electron-store → conf → ajv → fast-uri                | URI normalization advisories need use of normalized attacker input as a network trust decision. No such src decision identified; schema parsing remains real. Patched to 3.1.9.                                                                                                                                                                                                                                                                                                                                 |
| node-gyp → make-fetch-happen → socks → ip-address     | Proxy/address parsing during native builds, not a found runtime address allowlist. Patched to 10.7.5.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Vite/PostCSS → nanoid                                 | Advisories require attacker-controlled generator size/custom generator; app uses uuid, not these APIs. Patched transitive nanoid to 3.3.20.                                                                                                                                                                                                                                                                                                                                                                     |
| Vite/Vue compiler → postcss / source-map-js           | CSS/source-map auto-loading and indexed-map parsing matter for malicious build inputs, not just prod graph labels. Patched to 8.5.32/1.2.2.                                                                                                                                                                                                                                                                                                                                                                     |
| builder → flatpak-bundler → tmp-promise → tmp         | Build filesystem/temp-file attacks. Patched to tmp 0.2.7.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Electron → @electron/get → undici                     | Install/download HTTP client; SOCKS/cache/WebSocket/TLS conditions differ per advisory, and these are not automatically src runtime requests. Patched to 7.30.1. Electron's embedded undici is a separate runtime supplied with Electron.                                                                                                                                                                                                                                                                       |
| jsdom → ws                                            | Test WebSocket transport; malicious frames require an actual peer. Patched to 8.22.0.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| knip → zod                                            | Oversized constrained collection validation would require untrusted tool inputs. Patched to 4.6.7.                                                                                                                                                                                                                                                                                                                                                                                                              |

Other remaining records are moderate tooling advisories in Vitest/mocker/coverage,
postcss-selector-parser and smol-toml, plus low esbuild dev-server exposure. Tests
and tooling use repository-owned inputs; do not expose their dev servers to
untrusted clients. They are visible in candidate-all.json, not silently accepted
by a new audit gate. The Tobii/eyelog moderate records propagate decompress risk.

### Narrow upstream plan (not executed)

`npm ci --ignore-scripts` and `npm ls` confirm the installed eyelog is git commit
`de5496917948b2ae881827e9caa32763391ddd74`, despite Tobii's parent declaration
`linkasu/node-eyelog#41e8280`. Its postinstall downloads EyeLog Release.zip 1.1.1.0
without its own checksum. Do not silently replace that resolution or run it near
secrets.

With separate owner approval: change node-eyelog's extraction dependency to the
maintained @xhmikosr/decompress fork (>=10.2.2 or >=11.1.4), verify Node 22 and
CommonJS/API compatibility and symlink/hardlink fixtures, pin/verify the binary
checksum **before** extraction, publish an explicitly reviewed immutable parent
artifact, then bump Tobii and this app's lock deliberately. No other repository
was modified here, and no fork override is asserted compatible without testing.

## Verification boundaries

Local and exact-head CI results are recorded in the draft PR. In particular:

- Physical Tobii, live calibration/gaze and a real installer update are **never run**.
- Native module build/load without hardware is not a physical Tobii pass.
- Windows EyeLog cannot be provisioned by the unsafe lifecycle. A missing binary
  must fail the existing resource/provisioning check; do not suppress that failure.
- PR macOS checks cover both packaging architectures; their conclusions must be
  checked for the exact pushed head before promoting the draft.
- macos-330-signing-recovery.yml and run 41033267787 are not changed, cancelled or
  repurposed. Ordinary release/update/publish workflows are not dispatched.
