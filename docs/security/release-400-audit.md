# Release 4.0.0 dependency audit: A01/A02

## Decision and scope

Public npm registry audit on 2026-11-03, Node **22.22.2**, npm **10.9.7**:

- Before: **11 production findings = 2 high + 9 moderate**.
- After the compatible Vue patch update: **9 production findings = 0 high + 9 moderate**.
- **Current, after the real public Tobii 0.2.17 pin and clean install: 6 moderate,
  0 high, 0 critical**. Source: `release-evidence/400/tobii-0.2.17-audit.json`.
  The remaining production findings are archiver, archiver-utils, readdir-glob,
  zip-stream, minimatch 3.1.5/5.1.9 and glob 7.2.3. G and the native node-gyp/cache
  chain are absent from this production audit, not patched into safe versions.
- Vue and its nine runtime/compiler/shared packages are installed and locked at
  **3.5.44**; the direct dependency is `^3.5.44`. npm resolved this published patch
  from the requested `vue@^3.5.42`. Four Babel parser/type helpers also advanced
  within their existing major as required by the new Vue compiler dependency tree.
- **A01: fixed at dependency level**, not waived on the basis of an SSR grep.
- **A02 source/build conclusion: scoped `NOT_REACHABLE` for the remaining M trigger**,
  with historical/dev G analysis retained below. The six moderate findings remain
  visible, not suppressed or represented as fixed. Primary review is still required.
- **A02 artifact binding: PENDING P-job**, not PASS. Actual installer/ASAR contents,
  the actual Windows inventory must match this lock, asset pin and audit before final
  signoff. This source review grants no release/operator authorization.

In the original A01 lane, only security dependency versions in `package.json` / `package-lock.json` were
changed. The existing root version `4.0.0`, Tobii dependency, predictor resources,
packaging configuration and other agents' changes were preserved. No forced
audit fix, downgrade, major upgrade, audit suppression, publish, GitHub HTTP,
secret operation, full reinstall or lifecycle script execution was performed.

The A02 continuation changes only this report and the narrow
`scripts/ci/release-security-audit.cjs` helper/test. It does not change dependency
versions, build scripts or other agents' helpers. No fresh broad audit was run in
the continuation: the primary owner supplied the current post-pin audit above.

### Boundary of the NOT_REACHABLE conclusion

Reviewed inputs are user `.linka` archives/media at application runtime and the
candidate build from trusted, pinned application/tooling/dependency sources.
CI workspace/cache roots, package configuration, environment and approved
provisioning whitelist are controlled by CI/release maintainers; user archives
are not opened before/during build. This does **not** cover an attacker editing
repository/build configuration, replacing packages, setting arbitrary module or
prebuild environment overrides, or invoking arbitrary library APIs/CLI commands.
Those changes reopen the review rather than receiving an evergreen exception.

The original 0.2.16 dependency explanation is historical, not the current shipping
graph. The previous source review used Tobii commit
`6c3f8b4f1ce86db1479673002bdffde3d55e38fb`. Primary subsequently reports the
merged main source (`ae20f…`), all three technical CI gates, Publish and public
Release successful. The current immutable asset identity is:

- URL: `https://github.com/linkasu/linka-tobii-electron/releases/download/v0.2.17/linkasu-tobii-electron-0.2.17.tgz`
- Size: **1,157,232 bytes**.
- SHA-256: **10a66998baa78e273a5d33ce183f2a18d22bd660561dcd07e5662d5cfc292fb2**.
- Lock integrity: `sha512-LqhUCB90euN/QR/aGY9A+mP7j7Wq8no2qrxN682JvrxV7oP8IQx/9/VxU6u3cAe6DFHbi39J3R+N0swgLrjmgQ==`.

This lane independently checked the saved tarball size/SHA-256/SHA-512 against
that lock pin, read the newly installed 0.2.17 BackWatch/native-loader source,
and confirmed Vue 3.5.44 and **no installed `@linka/tobiifree-native`**. The public
release/CI status above is primary's evidence, not a new network check here.
The P-job still must bind the full merged source SHA, accepted tarball and actual
application artifact; source/lock checks do not turn into installer PASS.

Primary's clean `npm ci --ignore-scripts` plus whitelisted rebuild/provision
succeeded with npm 10 and `.npmrc` containing only `install-links=true`. That
standard option replaced stale file-link lock state (`node.target null`); no
direct native dependency or lifecycle-script bypass was added. The old local
node_modules tree was preserved in ignored evidence, not reused as the current
production graph. This lane did not reinstall or edit `.npmrc`/package/lock.

## Evidence and reproduction

Raw evidence is local and ignored under `release-evidence/400/closure-audit/`:

| Evidence                                                        | Meaning                                                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `before.json`, `after.json`                                     | Full fresh production audit responses, including advisory ranges and affected nodes                                     |
| `tree-before.json`, `node-gyp-explain.json`                     | Exact dependency paths, including native optional dependency making node-gyp production-reachable                       |
| `archiver-compatible.json`, `node-gyp-compatible.json`          | Registry shows installed 5.3.2 / 11.5.0 are newest releases in their existing majors                                    |
| `minimatch-fix-engines.json`, `glob-fix-engines.json`           | Registry metadata for advisory-fixed majors, not permission to override consumers                                       |
| `vue-registry.json`, `vue-tree-after.json`, `lock-changes.json` | Registry integrity metadata, coherent peer tree and changed lock nodes                                                  |
| `ssr-before.txt`, `ssr-after.txt`                               | The CR attribute-name check fails on 3.5.34 and passes on 3.5.44                                                        |
| `vue-advisory-check.cjs`, `vue-advisory-check.txt`              | Rerunnable public SSR seam check and installed/lock/integrity assertions                                                |
| `install.txt`                                                   | Targeted installation; scripts disabled; 14 packages changed                                                            |
| `zip-before.txt`, `zip-after.txt`, `vue-after.txt`              | Focused regression results                                                                                              |
| `guard-red.txt`, `source-guard-tests.txt`                       | New guard failed before implementation; 13 focused checks pass, including archive-name and missing-native-binding seams |

Current post-pin evidence under `release-evidence/400/`:
`tobii-0.2.17-audit.json`, `tobii-0.2.17.tgz`,
`tobii-0.2.17-integrity.json`, `tobii-0.2.17-clean-install.log`,
`tobii-0.2.17-whitelist-rebuild.log`, `tobii-0.2.17-sdk-provision.log`,
`tobii-0.2.17-app-green.log`. The last log is primary's **30/30**
MixedInput/EyeButton/OutputGaze check, not a test rerun by this lane.
Under `closure-audit/`, `tobii-017-source-check.txt` records this lane's actual
tarball/lock/dev-only/native-absence assertions;
`tobii-017-guard-red.txt` / `tobii-017-guard-tests.txt` record the updated guard's
red/green tests (**22/22**, including rejection of a replaced parent URL/SRI,
installed native node, returned production N/G, and shipped dev build package).
No fixture inventory is represented as a P-job result.

Commands (run from the project root with Node 22.22.2 on PATH):

```sh
npm audit --omit=dev --registry=https://registry.npmjs.org --json
npm explain node-gyp --json
npm ls vue @vue/server-renderer --all --json
npm view vue@3.5.42 version dependencies --registry=https://registry.npmjs.org --json
npm install vue@^3.5.42 --ignore-scripts --registry=https://registry.npmjs.org --no-audit --no-fund
node release-evidence/400/closure-audit/vue-advisory-check.cjs
npx vitest run --config vitest.node.config.ts src/electron/tests/unit/linka-zip.spec.ts --maxWorkers=1
npx vitest run src/frontend/tests/unit/OutputLine.spec.ts src/frontend/tests/unit/Store.spec.ts --maxWorkers=1
node --test --test-concurrency=1 scripts/ci/release-security-audit.test.cjs
```

The initial red assertion was
`assert.equal(require("@vue/shared").isSSRSafeAttrName("x\ronload"), false)`:
3.5.34 returned `true`. After the update this is `false`, and public
`ssrRenderAttrs({ "x\ronload": "alert(1)" })` produces an empty string.
All ten Vue installed versions match their lock entries and carry SHA-512
integrity. `npm ls` reports a coherent Vue peer tree. The installer initially
warned about the old 3.5.34 server-renderer peer while resolving; that old peer
is absent in the final tree.

Focused tests: archive **22/22 before and after**; Vue OutputLine/store
**43/43 after**. No application source was changed to make these checks pass.
Full quality gate and final packaged-artifact checks are owned by the primary
release session and were deliberately not duplicated here.

## Actual application and build paths

### V: Vue / SSR

`src/frontend/main.ts` creates a client `createApp(App)` and mounts `#app`.
`src/electron/main.ts:createWindow` loads local `dist/index.html` in production;
`vite.config.ts` uses the Vue client plugin and bundles the renderer, while main
dependencies are externalized. There is no identified application SSR entry in
these paths. This is stronger than a negative grep but is **not proof that all
transitive dependency or packaged code cannot invoke SSR**. Vue directly depends
on server-renderer; test-utils also has an optional peer on it. Attacker-controlled
attribute names reaching SSR are the advisory's required input. Rather than waive
that unproven negative, both vulnerable dependency nodes were patched. Installed
seam checks do not establish that an older already-built binary was rebuilt.

### A: application archive writer

The only application import of archiver is `src/frontend/utils/addToZip.ts`.
Its production caller is `src/electron/services/card-storage-service.ts:addBuffer`:
selected/generated media -> `appendZip` -> validated existing `.linka` archive ->
fresh temporary directory -> `archiver("zip")` -> `archive.directory(tempDir, false)`
-> validated output -> atomic rename. The sibling direct caller is the archive
unit test. The importer can receive untrusted filenames/archive contents, so this
is a real trust boundary, not a dev-only dependency.

`src/common/utils/linkaZip.ts` validates paths, entry types, duplicates, compression
and expanded sizes before extraction (2,000 entries and 500 MiB limits).
`node_modules/archiver/lib/core.js:directory` passes only `{ stat: true, dot: true }`
to readdir-glob. `readdir-glob/index.js` constructs Minimatch instances only for
`pattern`, `ignore`, or `skip`, none supplied on this path. Archive entry names are
file paths, **not glob patterns**. Therefore the identified application writer
does not expose attacker-controlled globparts construction. archiver-utils' glob
import is present on disk but this directory path uses readdir-glob, not glob 7.
zip-stream handles entries and its utils dependency also imports glob 7; that
import alone does not prove a vulnerable matcher invocation.

The actual trigger is Minimatch pattern compilation (`make` -> `braceExpand` ->
`globParts`), not the presence of glob syntax in a file's name. In both
archiver-utils **2.1.0 and 3.0.4**, `file.expand` -> `processPatterns` ->
`glob.sync(pattern, options)` is the legacy-glob trigger entry. Neither
`archiver/lib/core.js` nor `zip-stream/index.js` calls `file.expand`,
`expandMapping`, or `normalizeFilesArray`: their used utils functions normalize
streams, metadata, dates and literal paths. `ZipStream.entry` ->
`_normalizeFileData` -> `sanitizePath` -> `ZipArchiveEntry(data.name)` does not
compile a filename as a pattern. The application has no `archive.glob`, matcher
filter callback, utils `file.expand` or readdir `pattern/ignore/skip` caller.

The focused test traps `Minimatch.prototype.make` in both installed archiver-path
copies and archives a real file named `{glob,parts}[x].txt` via the same
`directory(root, false)` call. Its literal name survives in the ZIP and no pattern
is compiled. Existing 22 archive tests cover the surrounding application writer.
**M trigger: NOT_REACHABLE from this app's archive/media inputs.** This does not
assert that all archive processing or all possible DoS conditions are safe.

### B: actual packaging matchers (build-only)

`app-builder-lib@26.16.1/out/fileMatcher.js:computeParsedPatterns` does construct
Minimatch instances: patterns come from `package.json:build.files`,
`asarUnpack`, `extraResources[].filter`, builder defaults and normalized CI staging
roots. `out/util/filter.js:createFilter` passes each discovered relative filename
to the already-compiled `pattern.match(path, ...)`; it does not promote a
filename to a pattern. Even the empty-pattern mapping case uses the build-defined
`relativeFrom`, not user content. These patterns and macro values are bounded,
source/target-controlled strings, not attacker-supplied amplified globparts.

The active ASAR path is `out/asar/asarUtil.js:pack` -> `processFileSets` ->
`executeElectronAsar` -> `createPackageFromStreams`, with its unpack predicate
coming from those compiled build filters. The installed `@electron/asar@3.4.1`
also exposes `createPackageWithOptions` -> `crawl(src + '/**/*', globOptions)` and
`isUnpackedDir` / `minimatch(filename, unpack)` APIs. These are not the active
builder stream path; even when explicitly used, their pattern/unpack arguments
are build options, while filenames remain match candidates. The inventory helper
uses `listPackage`, `statFile`, `extractFile`, not `createPackageWithOptions`.
No app archive is passed into packaging. **M amplification input: NOT_REACHABLE
under the controlled-build boundary** (matcher execution itself IS reachable).
Glob 7 is outside G's affected range. A new user-defined build pattern/root,
new hook or changed builder/asar implementation requires re-review.

### N: historical native chain; current dev-only build/cache analysis

The **historical 0.2.16** `npm explain node-gyp` recorded both a root dev dependency
and this production optional path:

```text
@linkasu/tobii-electron@0.2.16
  -> optional file:native/tobiifree-native (@linka/tobiifree-native@0.0.1)
     -> node-gyp@^11.0.0 (resolved 11.5.0)
        -> make-fetch-happen@14.0.3 -> cacache@19.0.1
           -> glob@10.5.0 -> minimatch@9.0.9
```

**Current 0.2.17 state:** clean installation with `install-links=true` did not
install the optional `file:native/tobiifree-native` dependency. The current lock
has **no `node_modules/@linka/tobiifree-native` entry**. `node-gyp@11.5.0`,
`make-fetch-happen@14.0.3`, `cacache@19.0.1`, its glob 10.5.0 and minimatch 9.0.9
are **dev-only**; they are not the current production dependency chain. The six
production findings contain only glob 7 / minimatch 3+5 on the archive path.

Tobii's tarball still contains C++ source and
`native/tobiifree-native/package.json` declaring node-gyp as a dependency.
That manifest is **SOURCE_SUBPACKAGE**, not evidence that its declared dependencies
were installed. A manifest found at
`node_modules/@linkasu/tobii-electron/native/tobiifree-native/package.json` in a
future ASAR must be bound to the pinned parent tarball SHA/SRI above, not relabelled
an installed node-gyp/native graph. A real installed
`node_modules/@linka/tobiifree-native` or shipped node-gyp/cache package is a
different state requiring review. The guard distinguishes these exact paths.

#### Runtime loaders, missing-binding fallback and installer

The native **source subpackage's** `index.js` and reviewed 0.2.17 source have the same logic:
`require('node-gyp-build')(__dirname)`; on error, direct
`require('./build/Release/tobiifree_native.node')`. The latter may fail too; it
does not run npm or compile. `node-gyp-build@4.8.4/index.js` chooses native addon
resolution or `node-gyp-build.js`. That runtime file only searches
`build/Release`, `build/Debug`, platform/ABI prebuilds and the executable's nearby
prebuilds, requires a matching `.node`, or throws `No native build was found`.
Its `matchBuild`, `matchTuple`, `matchTags` functions use suffixes/equality, not
Minimatch/glob. There is no child-process import or runtime compiler fallback.

In current 0.2.17, `BackWatch.createTracker` uses `EyeLogTrackerProcess` by
**default on Windows**, unchanged from the user-accepted legacy SDK path.
Only `TOBII_NATIVE=1` tries `NativeTobiiTrackerProcess`, whose fixed module-name
require fails when the optional package is absent; BackWatch catches that error
and falls back to EyeLog. It does not require the source-subpackage directory
or compile it. EyeLog runs fixed `EyeLog.exe` through `eyelog/dist/TobiiProcess`.
No new direct native dependency is needed or authorized to change that behavior.
The previously reviewed macOS branch falls back to `TobiiFreeTrackerProcess` (fixed helper JS
path via Electron-as-Node). The helper loads the packaged SDK; SDK `nodeusb.ts`
dynamically imports the literal module `usb`. `usb@2.17.0/dist/usb/bindings.js`
uses the same **runtime** node-gyp-build loader. Missing USB/native bindings
produce errors/status/fallback, not an npm/compiler invocation. SDK WASM
instantiation is not a JavaScript node-gyp/glob call. No glob/filter input is
derived from gaze/calibration/card data on these paths.

The focused missing-binding test loads the real node-gyp-build runtime against
an empty temporary directory with all child-process launch functions trapped:
it throws the expected missing-build error and makes **zero** process launches.
No native module/hardware is loaded by this test.

`build/installer.nsh:customInstall` checks VC++ registry state and can execute
only the bundled `vcredist_x86.exe /install /quiet /norestart`; it aborts on a
failed redistributable check. The current production installer extracts/copies
the application; it does not run npm lifecycle scripts merely because package
manifests contain `install`, `postinstall` or `build` fields. NSIS has no npm,
node-gyp or cache-maintenance invocation. Therefore **N's G/M functions are not
runtime-reachable**, including the optional-binding failure path.

#### Build CLI versus runtime; cache and signal tracing

The separate `node-gyp-build/bin.js` CLI **can** spawn node-gyp after its
prebuild-test fails; this is an installation/build entry, not the exported loader.
The native package's explicit `build` script likewise runs `node-gyp rebuild`.
The candidate workflow `.github/workflows/release-331-preflight.yml` installs
with `npm ci --ignore-scripts`, then whitelists only
`npm rebuild pictures.bank-api esbuild electron` and pinned EyeLog provisioning.
Those selected scripts respectively compile the fixed package's TypeScript and
install esbuild/Electron binaries, not user archives. `provision-eyelog.cjs`
checks the EyeLog override pin/SDK hash before its explicit installer; the
reviewed `eyelog/download.js` downloads bounded pinned bytes with curl, verifies
the hash before decompression, then writes flat allowlisted files. It does not
use archiver/glob/Minimatch or call node-gyp. No general lifecycle execution or
user `.linka` parsing is added by that whitelist.

`electron-builder` may still rebuild native dependencies **during build**:
`Packager.installAppDependencies` -> `installOrRebuild` sees the installed
node_modules and takes `rebuild`, not the missing-tree `npm install` branch ->
`out/util/rebuild.js` -> `helpers/remote-rebuild.js` -> `@electron/rebuild`.
Its node-gyp worker calls configure/build against dependency source in the CI
workspace with CI-controlled Electron version, architecture and `.electron-gyp`
root. This is a real compiler entry, not a runtime call or a reason to pretend
`--ignore-scripts` disables builder's explicit rebuild. Its separate dev
node-gyp **12.4.0** is distinct from root dev node-gyp **11.5.0**; neither is a
current production finding. macOS 4.0.0 is not released or claimed qualified here.

For the affected node-gyp **11.5.0**, `lib/download.js:download` constructs only
headers/proxy/noProxy/optional CA options for make-fetch-happen: **no cachePath,
cacheManager or signal**. `make-fetch-happen/lib/cache/policy.js:storable`
returns false without cachePath, so this call takes remote fetch rather than a
disk-cache glob traversal. Even make-fetch-happen's disk-cache entry API uses
`index.compact`, `rm.entry`, `put.stream`, `index.insert`, `get.stream.byDigest`,
`rm.content` — not cacache `verify` or `rm.all` (the two glob wrappers).
HTTP request AbortSignals elsewhere in typing/telemetry/provisioning are not
forwarded to this filesystem chain.

For completeness, both installed cacache **19.0.1** glob sites are traced:

| Function                                | Pattern origin                                             | Actual options delivered through `lib/util/glob.js` | G/M conclusion                                                                                     |
| --------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `rm.all(cache)`                         | CI-controlled cache root + literal `*(content-*\|index-*)` | `{ silent: true, nosort: true }`                    | Not called by the affected fetch/cache path; no `signal` or untrusted amplified pattern            |
| `verify -> garbageCollect(cache, opts)` | CI-controlled content directory + literal `**`             | `{ follow: false, nodir: true, nosort: true }`      | Not called by affected fetch/cache path; even caller `opts.signal` is not spread into glob options |

Glob **10.5.0** `Glob` stores `opts.signal`; `GlobWalker` registers/tests that
signal for the cancellation behavior described in G. With **no signal supplied
at either call site**, the AbortSignal cancellation-bypass trigger cannot occur.
M's pattern compiler can execute for these fixed internal patterns, but there is
no attacker-selected globparts source; cache keys/content filenames are not
concatenated into the pattern as instructions. **G/M triggers: NOT_REACHABLE**
under the stated runtime/build boundary. This conclusion does not depend on
assuming the production dependency is absent from the installer.

`package.json:build.files` explicitly includes the Tobii package, so its native
**source manifest** may legitimately appear in inventory. Current production
dependency collection has no installed native N chain to collect; the lock's
dev-only cache/build packages must not be assumed shipped. Conversely, their
absence from a particular ASAR is established only by the actual inventory.
`extraResources` explicitly copies `usb` and **node-gyp-build**, not a finding
named node-gyp. Neither this distinction nor `devDependencies` proves absence
from the final ASAR. No installer/ASAR was built or inventoried by this lane:
shipping status below is **expected by dependency/config, actual PENDING P-job**.

## Per-finding disposition

Advisory identifiers are the exact npm audit identifiers. Transitive rows have no
independent advisory: their advisory is inherited through the stated dependency.

- **S**: [GHSA-g2v6-rqmx-r4w6](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6),
  SSR XSS via missing CR in attribute-name blacklist; server-renderer `<3.5.42`.
- **M**: [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249),
  minimatch globparts amplification DoS; `<11.0.1`.
- **G**: [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4),
  glob AbortSignal cancellation bypass / post-timeout traversal;
  `>=9.0.0 <=14.0.1`.

All paths in this table are relative to `node_modules/`. Shipping V/A/N refers to
the concrete paths above, not an assertion of completed artifact inspection.

| Finding / exact installed version             | Advisory / exact node path below `node_modules/`                       | Trigger decision, not a version fix                                                                                                                  | Owner / review                                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `@vue/server-renderer` 3.5.34 -> **3.5.44**   | S; `@vue/server-renderer`                                              | **FIXED**; CR/SSR seam passes, artifact binding pending                                                                                              | Primary release maintainer; final rebuilt inventory                                                                     |
| `vue` 3.5.34 -> **3.5.44**                    | S via server-renderer; `vue`                                           | **FIXED**; no high findings in recorded audit                                                                                                        | Primary release maintainer; final audit/inventory                                                                       |
| `archiver` **5.3.2**                          | M via utils/readdir-glob/zip-stream; `archiver`                        | **NOT_REACHABLE**, §A literal directory entries; audit's 4.0.2 downgrade rejected                                                                    | Archive maintainer + primary release owner; new glob/filter caller or dependency change reopens                         |
| `archiver-utils` **2.1.0 / 3.0.4**            | M via glob; `archiver-utils`, `zip-stream/node_modules/archiver-utils` | **NOT_REACHABLE**, §A neither copy's `file.expand` is called                                                                                         | Archive maintainer + primary release owner; new expand/mapping caller reopens                                           |
| `readdir-glob` **1.1.3**                      | M via minimatch; `readdir-glob`                                        | **NOT_REACHABLE**, §A no `pattern`, `ignore`, `skip`; matcher sentinel check passes                                                                  | Archive maintainer + primary release owner; any new matcher option reopens                                              |
| `zip-stream` **4.1.1**                        | M via utils/glob; `zip-stream`                                         | **NOT_REACHABLE**, §A `entry` handles names/metadata, not patterns; parent remains `^4.1.0`                                                          | Archive maintainer + primary release owner; changed entry/utility path reopens                                          |
| `minimatch` **3.1.5 / 5.1.9**                 | M; `minimatch`, `readdir-glob/node_modules/minimatch`                  | **NOT_REACHABLE trigger**, §§A/B; no user pattern compiler input. 9.0.9 in cacache is now dev-only, not a production node                            | Archive/build maintainers + primary release owner; new caller/pattern source/version reopens                            |
| `glob` **7.2.3**                              | M via minimatch; `glob`                                                | **NOT_REACHABLE trigger**, §§A/B; G does not affect glob 7. Glob 10.5.0 is dev-only and G is absent from production audit                            | Build maintainer + primary release owner; new glob version/signal/cache path reopens                                    |
| `cacache` **19.0.1 (dev-only now)**           | Historical G/M via glob; `cacache`                                     | **REMOVED_FROM_PRODUCTION_GRAPH**, not version-fixed. §N build proof retained: affected fetch never calls `verify`/`rm.all`; wrappers have no signal | Native/build maintainer + primary release owner; any return to production/shipped dependency requires review            |
| `make-fetch-happen` **14.0.3 (dev-only now)** | Historical G/M via cacache; `make-fetch-happen`                        | **REMOVED_FROM_PRODUCTION_GRAPH**, not version-fixed. §N controlled build download has no cachePath/cacheManager                                     | Native/build maintainer + primary release owner; new production fetch/cache caller reopens                              |
| `node-gyp` **11.5.0 (dev-only now)**          | Historical G/M via make-fetch-happen; `node-gyp`                       | **REMOVED_FROM_PRODUCTION_GRAPH**, not version-fixed. Native source manifest is not an installed dependency; runtime does not compile                | Native/build maintainer + primary release owner; installed native/compiler fallback or shipping N chain requires review |

The six current production rows retain scoped NOT_REACHABLE dispositions. The
three removed findings are not needed as production exceptions. For **every
row**, actual shipping is **PENDING P-job**: the installed/lock graph is verified
locally, not inferred to be an inventory of an installer. All NOT_REACHABLE rows are
bounded to the named versions, M/G advisory definitions and inspected call
paths; they are submitted for primary review, not self-approved risk waivers.
Different/new advisories or package versions have no inherited disposition.

## Closure requirements / limits

### Minimal future inventory/provenance check

The existing inventory/provenance schema is sufficient for a narrow check without
changing another owner's build or promotion code:

```sh
node scripts/ci/release-security-audit.cjs \
  release-evidence/inventory.json \
  release-evidence/400/tobii-0.2.17-audit.json \
  release-ready/provenance-windows.json \
  package-lock.json
```

**Not run on an actual P-job inventory yet.** The helper now binds installed
Tobii **0.2.17** to the exact public asset URL/SHA-512 pin, with its independently
verified size/SHA-256 recorded in the result. Its updated fixtures model the
current **six-finding** production audit and a dev-only node-gyp, not the old
production native chain. They exercise a future Windows x64 inventory;
no fixture is shipping evidence.
It rejects unknown finding names, advisory URLs/ranges, severities, production
node paths, selected production/shipped versions, inventory pin mismatches,
stale lock bytes and divergent source/installer provenance. Fewer findings are
permitted; new findings are not silently accepted. It returns
`REVIEWED_SOURCE_ONLY` plus evidence hashes, never `release PASS` or permission
to publish. No hook/workflow is silently wired or bypassed by this change.

Only **M** is now permitted in the production finding set: a reappearing G or
node-gyp/cache production finding fails closed for new review. An installed
optional native node in the lock, a shipped native module at its node_modules
location, or a shipped node-gyp/cache manifest also fails this reviewed boundary.
The exact native manifest under Tobii's `native/tobiifree-native` directory
(including its `app.asar.unpacked` mirror if present) is instead reported as
`SOURCE_SUBPACKAGE` with the pinned parent archive SHA-256. Its version is
checked as 0.0.1; its declared dependency strings are **not** installed packages.
The classification cannot be used at an arbitrary source path or for a real
`node_modules/@linka/tobiifree-native` installation. The guard records parent
asset identity through its verified SRI; actual per-file correspondence inside
the final ASAR remains the P-job's byte/provenance check, not a claim derived from
package version metadata alone.

This is not a source-callgraph detector or a substitute for primary review. The
existing `release-artifacts.cjs verify` remains responsible for the accepted
artifact set/bytes. A hash-consistent JSON inventory alone cannot prove it was
extracted from the accepted installer; P-job provenance and source-archive
binding must establish that. Save the helper's result inside the release evidence
and bind it to the accepted evidence archive; if executed after provenance is
staged, regenerate provenance through the owning pipeline, never hand-edit it.

### Exact fields/evidence required for final signoff

1. Candidate identity: inventory `schema`, `app`, `tooling`, `builder`, `electron`,
   `lockSha256`; provenance `schema`, `version`, `platform`, `run`, `app`,
   `tooling`, `signing`. APP/TOOLING must name the exact reviewed build sources.
2. The **actual lock bytes** matching `lockSha256`, and inventory `pins[]` with
   `path`, `version`, `resolved`, `integrity`, `dev`. Compare the exact Tobii
   0.2.17 source/tarball resolution/integrity and SHA-256/size to the exact public
   asset above and its full merged source/tag SHA from primary's release evidence;
   inspect its runtime/native/helper bytes, not just the version string. Do not
   substitute the earlier pre-merge review commit for that release identity.
3. Fresh production `npm audit --omit=dev --registry=https://registry.npmjs.org
--json` **after that pin**: full `auditReportVersion`,
   `metadata.vulnerabilities`, and every `vulnerabilities[name]` with `severity`,
   `nodes`, `via` (direct advisory `url`, `dependency`, `range`). Capture
   command, registry, time and audit digest. A transport/error result is not an
   empty audit; newly introduced findings require review, not this allowlist.
4. Actual Windows x64 inventory `packaged[].target`, `asarSha256`, every
   `packages[]` **path/name/version**, and `resources[]` **path/kind/size/sha256**
   (or symlink target). Include `app.asar.unpacked` plus all extraResources,
   notably every duplicate glob/Minimatch package, any unexpected cache/node-gyp
   dependency, Tobii's SOURCE_SUBPACKAGE manifest/source, USB and node-gyp-build
   runtime/CLI files. Distinguish the absent installed optional native module
   from source files inside the pinned parent tarball. Absence must come from the
   complete inventory, not a production/dev declaration. Bundled renderer
   versions require matching build/lock provenance even without package.json.
5. Inventory `installers[].name/sha256`, `sourceArchiveSha256`,
   `toolingArchiveSha256`; provenance `files[].name/size/sha256` for installer,
   blockmap, updater metadata and source/evidence archive. Verify accepted bytes
   using the existing promotion verifier, bind inventory/audit/check result to
   those bytes and inspect the final installer hook (no new npm/compiler hook).
6. Primary owner's explicit review of this scoped NOT_REACHABLE conclusion and
   final inventory/provenance check, including whether its controlled-source,
   environment/cache-root and provisioning-whitelist premises actually held in
   that run. Unchanged legacy macOS compatibility bytes are **not rebuilt/fixed
   by the Vue patch**, and this Windows 4.0.0 source disposition is not a new
   audit or blanket waiver for their historical dependency set.

Reopen before signoff on any new advisory, version/dependency/lock graph change,
new archive glob/filter/expand caller, file-name-to-pattern conversion, glob
signal forwarding, untrusted cache/build root, runtime compiler fallback or
installer lifecycle hook. Primary decides required remediation/re-review; this
lane grants no blanket exceptions. Actual source/bytes/trigger mismatches remain
**specific blockers** until resolved, not automatic NOT_REACHABLE entries.

Skipped here: another audit (primary's post-pin audit was inspected), full gate, provisioning, installer builds,
hardware and CI execution/publication. Risk: source trigger gaps are closed only
within the recorded boundary; actual artifact/source binding is still PENDING,
and the six current moderate production findings remain visible.
