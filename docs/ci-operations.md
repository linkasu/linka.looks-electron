# CI operations

## Обычный PR

Push в PR запускает `CI`. Check `ci-required` всегда существует, включая docs-only
изменения. Routing summary показывает выбранные suites и причины. Изменение текста
описания PR не запускает сборки. Новый push отменяет устаревший PR run, но не release
или mirror operation. Не обходить красный check повторными rebuild без диагностики.

Static/contracts используют один locked setup без lifecycle scripts. Прикладной
Windows job собирает текущий код один раз; исторические baseline/PR121 не входят в
обычный PR. Model training/FINAL никогда не являются побочным эффектом PR.

Полный read-only canary для проверки нового самого CI, без publication:

```sh
gh workflow run ci.yml --ref main
```

Это явный полный прогон, а не повторяемый эффект каждой правки harness. Он не
создаёт candidate descriptor; окончательный релизный candidate строится отдельно.

## Новый кандидат

После merge и зелёного `ci-required`:

```sh
gh workflow run windows-candidate.yml --ref main -f app_sha=EXACT_MAIN_SHA
```

Не передавать версии/hash/run IDs вручную вместо данных выбранного commit.
Producer получает версию из приложения и закрепляет настоящий опубликованный
baseline ниже неё. Сначала проверяются source/notes/resource approvals, затем
installer собирается один раз. В summary появляется `candidate_id`: ID маленького
descriptor artifact, а не имя EXE и не произвольный Git SHA.

Успешный terminal producer запускает qualification. Если builder/audit упал,
существование промежуточного artifact не разрешает следующий release stage.

## Диагностика и повтор

Повторная проверка сохранённого кандидата не вызывает builder:

```sh
gh workflow run windows-qualification.yml --ref main \
  -f candidate_id=CANDIDATE_ARTIFACT_ID -f suite=upgrade -F diagnostic=true
```

Доступны suites `all`, `upgrade`, `packaged`, `security`. Installed packaged
assertions и genuine upgrade могут использовать один реальный native scenario:
этот reuse не означает отдельную cold-install/hardware qualification.

Диагностический результат не является release eligibility, даже если все его
исполненные assertions зелёные. Не заменять `NOT_RUN` пропущенных gates на PASS.

Для штатного failed qualification используйте стандартный повтор failed jobs:

```sh
gh run rerun QUALIFICATION_RUN_ID --failed
```

Успешные outputs сохраняют их исходные ID/attempt/hash. При невозможности доказать
происхождение pipeline останавливается. На новой VM нельзя продолжать NSIS с
произвольной середины: native suite начинается на свежем профиле и проверенном
historical installer. Не увеличивать timeout, не заполнять registry за installer и
не менять старую version ради зелёного результата.

`latest jobs` GitHub может выдавать для сохранённого успешного job новый ID и номер
текущей попытки. Pipeline отдельно проверяет исходную producing attempt через API;
не исправляйте сохранённые report IDs/attempts вручную и не считайте такую проекцию
новым исполнением тестов.

## Публикация

Нормальный запуск: successful qualification → read-only validation → один approve
в `release-production` → immutable draft/upload verification → publication.
Для контролируемого повторного входа достаточно одной ссылки на qualification run:

```sh
gh workflow run release.yml --ref main -f qualification_run_id=QUALIFICATION_RUN_ID
```

Пока `CI_V2_RELEASE_ENABLED` отсутствует или не равен `true`, write-path отключён.
Включение допускается после проверки workflow и защиты production environment.
Нельзя включать переменную, чтобы обойти failed qualification или collision.

Publisher автоматически проверяет software/packaged/security/genuine-upgrade,
candidate digest, actual terminal producer/run/jobs и hashes всех файлов. Ни
ручная строка `APPROVED`, ни чужой/отменённый/diagnostic artifact этого не заменяют.
Публикуются исходные candidate bytes; checkout build или пересборка запрещены.

Состояния операции:

```text
candidate → qualified → draft → verified draft → published
                                           published → distribution verified
```

API timeout после записи — сначала read/reconcile actual release/tag/assets.
Совпадающий незаконченный draft можно безопасно продолжить; другой hash или source
требует остановки. Matching published release возвращает ALREADY_PUBLISHED без
изменения файлов. Никакого force/delete/reupload существующей стабильной версии.

## Public mirror

Mirror берёт точный published tag и digest installer, сохраняет предыдущую
generation и атомарно переключает pointer. Старый server `update.js` и ручной
параллельный writer не используются. Не удалять stale lock без отдельного осмотра
живых процессов и фактического current target.

После SSH switch hosted CI проверяет public version, manifest и download bytes.
Повторить только public probe, без SSH и повторного deployment:

```sh
gh workflow run publish-linka-looks-updater.yml --ref main \
  -f version=PUBLISHED_VERSION -F verify_only=true
```

Локальный `CONNECT tunnel ... 503` может относиться к proxy, а не origin; не
объявлять сайт упавшим только по этой ошибке. Итоги различают publication и
distribution verification. Ошибка зеркала не разрешает перезапись/удаление GitHub
release и не является автоматическим installer downgrade.

## Изменение harness и моделей

Harness SHA фиксируется отдельно от app/build SHA. CI-only исправление проверяется
на сохранённом кандидате, а не новой сборке идентичного приложения. Любое изменение
build inputs создаёт нового кандидата. Смена тестового observation не меняет bytes.

Модельный import использует отдельно reviewed model source и фактический CI
workflow SHA. Book вычисляет модель/DEV/FINAL; CI проверяет и импортирует. Никаких
PAT на Book, bearer URLs в dispatch inputs, raw corpus/FINAL targets в artifacts.
Изменение транспорта не является разрешением повторять или настраивать FINAL.

## Cutover и ограничения

Сначала новый check и native canaries проходят на ветке. Затем новые workflows
попадают в main; включается `ci-required` с сохранением существующих owner/force
push/deletion правил. Production environment получает явный reviewer до включения
write-path. Единственному maintainer не навязывается невозможный self-review PR.

Исторические v4.0.0/base-ru-v1 releases, исходные receipts и hashes не переписываются.
Для canary допустим новый непубликуемый candidate artifact; это не выпуск новой
версии, не новая модель и не повод обходить collision guard существующего tag.

Physical Tobii, calibration, audible speech и consumer Windows 10/11 остаются
NOT_TESTED, пока для них нет отдельного фактического результата. CI не является
клиническим AAC или независимым юридическим сертификатом. Остаточные security
findings показываются с их конкретным reviewed scope, не скрываются общим PASS.
