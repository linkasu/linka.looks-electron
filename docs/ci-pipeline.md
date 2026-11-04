# CI: один кандидат, независимая квалификация, публикация тех же bytes

## Scope и неизменяемые условия

Реализация следующего CI не меняет опубликованный v4.0.0 или base-ru-v1.
Текущий продукт: unsigned Windows x64; macOS остаётся на закреплённых 3.3.1 assets.
Модельные вычисления остаются на Book. Raw corpus, FINAL targets, credentials и
пользовательские профили не входят в CI artifacts или release assets.

```text
PR → routing → fast checks + не более одной нужной Windows build/integration
main/manual → Windows candidate build (один раз, terminal success)
  → qualification (software, packaged, security, genuine upgrade)
  → qualified receipt → production approval → exact-byte publication
  → atomic mirror update → external public download verification
```

## Матрица исполнения и возобновления

- **PR:** read-only, без release/deploy secrets. Routing по изменённым файлам;
  неизвестный путь консервативно прикладной. Windows build только для app/packaging.
  Старый PR run отменяется новой revision в той же concurrency group.
- **Manual CI canary:** read-only explicit dispatch без release/deploy secrets;
  проверяет полный repository input set, включая unit и одну Windows integration
  build. Не создаёт release candidate или разрешение на publication.
- **Candidate:** trusted main dispatch, exact app SHA из main history. Один
  installer плюс source/inventory. Не auto-cancel; повторная квалификация использует
  сохранённый candidate ID, не builder.
- **Diagnostic:** exact candidate, выбранная suite, read-only disposable Windows.
  Ноль app/model builds. Результат diagnostic никогда не даёт release eligibility.
- **Qualification:** trusted main, все обязательные suites на одном candidate.
  Ноль app/model builds. Standard Actions rerun failed jobs; не возобновлять NSIS
  посередине на другой VM.
- **Publication:** terminal successful origins и production environment approval.
  Ноль builds. После uncertain HTTP outcome сначала reconciliation; опубликованные
  bytes не заменять.
- **Mirror verify-only:** read-only public HTTP probe без SSH/update/lock; manual
  default. Повторяет только проверку доставки уже опубликованных bytes.
- **Model:** отдельная explicit Book execution и metadata-only CI import, не app PR.
  CANCELLED/неполный producer не признаётся успешным; FINAL не auto-retry.

`NOT_APPLICABLE` — объяснение маршрутизации, не PASS неисполненного теста.
`NOT_TESTED` для физических устройств/consumer Windows не переименовывается в PASS.

## Согласованные тестовые interfaces

1. Routing: список repo-relative changed paths → необходимые suites и причина.
2. Candidate: descriptor + фактические bytes/API origin → accept/reject.
3. Qualification: subject candidate + gate reports/API origin → release/diagnostic/failure.
4. Publication: exact candidate + terminal qualified receipt → publishable file set
   либо fail-closed, включая collision/reconciliation.

Для каждого interface: маленький red→green vertical slice; затем focused checks.
Полный quality gate один раз после review, повторять только затронутые проверки.

## Контракт кандидата v1

`candidate_id` — immutable Actions artifact ID маленького descriptor artifact.
Не пытаться включить этот ID в собственные bytes descriptor: он известен после upload.
Descriptor artifact называется `candidate-RUN-ATTEMPT`; его SHA вычисляется consumer
из исходных bytes. Он загружается последним; producer должен terminally succeed.

`schema=linka-windows-candidate-v1`:

- `repository`: `linkasu/linka.looks-electron`;
- `version`: stable numeric semver; `appSha`, `buildToolingSha`: exact Git SHAs;
- `buildRunId`: positive numeric string, `buildRunAttempt`: positive integer;
- `installer`: `{name, bytes, sha256, sha512}`;
- `resources`: `{modelSha256, runtimeSha256}` from the selected app's approved
  Windows resources; installed model/runtime must match, not merely exist;
- `baseline`: `{version, tag, sourceSha, releaseId, assetId, installer}`;
  baseline installer additionally has its exact public URL. Select the highest
  published stable version below candidate version once, then pin bytes/identity.
- `artifacts`: `windows`, `sources`, `security`; each
  `{id, name, bytes, sha256, files:[{name,bytes,sha256}]}`.

Artifact names: `windows-candidate-RUN-ATTEMPT`, `candidate-sources-RUN-ATTEMPT`,
`candidate-security-RUN-ATTEMPT`. IDs and artifact zip digests come from upload
outputs, not operator-entered copies. Windows contains installer/blockmap/latest.yml
and provenance; sources contains corresponding source/notices; security contains
lock, inventory, fresh audit and bound signoff. Upgrade downloads only Windows and
the small descriptor; source bundles and frozen Mac assets are publication inputs.

The source artifact also carries `release-notes.md` from the selected app checkout:
`docs/releases/VERSION.md`, with an explicit historical-4.0.0-only fallback to
`docs/release-400-notes.md`. Missing notes fail before building. Publisher uses these
bound bytes, not the current harness checkout's description. Future releases retain
a sanitized `release-provenance.json`, not raw diagnostic traces or user profiles.

`scripts/ci/candidate-contract.cjs` owns strict descriptor/origin/file validation.
`scripts/ci/candidate-io.cjs` is the GitHub/download adapter, never executes archive code.
Keep existing ZIP/path/size/hash guards and existing reviewed security policy.
Candidate origin: own repository, successful main manual build workflow, exact
build-tooling SHA, matching run/attempt and artifact membership. Artifact existence
alone, user JSON claims and `latest` artifact selection never establish trust.

## Qualification v1

`schema=linka-windows-qualification-v1`:

- `repository`, `candidateId`, `candidateSha256`, `version`, `appSha`,
  `buildToolingSha`, `installerSha256`;
- `harnessSha`, `runId`, `runAttempt`, `mode` (`release` or `diagnostic`), `status`;
- `gates`: exactly `software`, `packaged`, `security`, `upgrade`, each with status
  and hash-bound report reference; `reports:[{name,bytes,sha256}]`.

Eligible artifact: `qualification-RUN-ATTEMPT`, uploaded only for all required PASS
on trusted main. Other evidence is `qualification-diagnostics-RUN-ATTEMPT` and is
not publishable. Publisher additionally checks actual producer workflow/run/jobs,
terminal success, main origin and file hashes. A self-asserted PASS is insufficient.

The real installed-app post-upgrade checks may produce packaged and upgrade gates
from the same native scenario; do not duplicate installation merely for two job
names. Both gate reports must prove their distinct assertions. No hardware claim.
Diagnostic suite selection does not synthesize missing gates. Standard rerun failed
jobs may reuse successful job outputs only with their original IDs/attempts, exact
candidate binding and eventual successful complete workflow; no cancelled producer
or lone partial artifact becomes an eligible qualification.

`scripts/ci/qualification-contract.cjs` owns receipt/origin validation.
The harness retains required Windows folder paths while excluding tokens and
arbitrary overrides, observes actual old PID exit, checks actual new version and
responsive NSIS restart, and preserves settings/archive/media/unknown fields/draft.
Baseline/target versions come from the verified candidate, not hardcoded 3.3.1/4.0.0.
Failure evidence is bounded and includes stage, process/window state, screenshot,
stdout/stderr and prerequisite logs without credentials or arbitrary env dumps.

## Publication and rollout safety

`release.yml` consumes a completed qualification run (automatic workflow_run or one
manual run reference). It validates candidate and four receipts before entering
`release-production`. Only the final publisher has contents:write; PRs never do.
Automatic publication remains disabled until `CI_V2_RELEASE_ENABLED=true` is
explicitly configured after native validation and production-environment protection.

No hardcoded future version. Existing Mac3.3.1 assets remain exact pinned compatibility
bytes, fetched/verified at promotion only. Draft creation/upload/verification and
publication are separate states. On API timeout, inspect tag/release/assets before
retry; matching unfinished drafts may resume, mismatches and published mutations fail.
Do not make a new app/model release merely to test this migration.

The current security review allows only its scoped, version/advisory-bound residual
moderates; new findings or changed shipped versions reopen review. Network/audit
errors are not successful audits. A source-only statement does not replace actual
installer/inventory binding. Public verification runs outside the local proxy and
hashes the actual versioned download. GitHub publication and distribution health
are separate reported states; a broken mirror must not rewrite a published release.

## Implementation ownership and verification

- PR routing/setup: `ci.yml`, routing helper/tests, one reusable app setup and one
  Windows integration job. Retire old repeated PR build/baseline workflows.
- Candidate: strict contract/IO/staging/tests and `windows-candidate.yml`; dynamic
  version handling preserves legacy verifier tests and historical releases.
- Qualification: strict receipt/harness/tests and `windows-qualification.yml`;
  remove obsolete update-smoke/main-only manual gate after equivalence checks.
- Publisher: machine-enforced gate, production approval, immutable collision handling,
  existing atomic mirror plus external verification. No deployment during PR tests.
- Model repo: explicit reviewed source/bundle identity independent of import workflow
  revision; remove unreachable legacy modes, preserve approval/seal/receipt checks.

Canaries consume one saved artifact with old/new validators, not two NSIS builds
expected to be bit-reproducible. Verify docs-only, CI-only, app, packaging and unknown
path routes; zero app builds for harness-only changes; one app build per app PR;
one final candidate build; reject missing/cancelled/diagnostic/mismatched receipts.
Measure actual durations/Actions minutes before assigning performance budgets.

Cutover: first green `ci-required` and native artifact/upgrade canaries, then enforce
the new required check and protected production approval. Preserve existing repo
rules/unknown user settings. Never require a second reviewer when only the sole
maintainer can act. Historical v4.0.0/base-ru-v1 assets and reports remain unchanged.
