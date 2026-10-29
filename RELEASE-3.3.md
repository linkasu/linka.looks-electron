# LINKa 3.3.0 — доказательства для review, не разрешение публикации

## Границы

- Исходный main: `2ffce5bf86fa8f423acbe72a9fa0f54102f095b4` (#131/#132 merged).
- Worktree исправлений: `/Volumes/data/linka/.opencode-worktrees/looks-3.3-release-gates`.
- Draft: <https://github.com/linkasu/linka.looks-electron/pull/133>.
- Сохранённый аудит **прочитан**, не заменён новым слепым аудитом:
  `/Volumes/data/linka/.opencode-worktrees/looks-main-3.3-audit/AUDIT-3.3.md`
  и `audit-evidence/` в том же дереве.
- Новые локальные evidence:
  `/Volumes/data/linka/.opencode-worktrees/looks-3.3-evidence-4daf42ba`.
- Чужой checkout `/Volumes/data/linka/linka.looks-electron` не редактировался.
- Версия подготовлена `3.3.0` в manifest/lockfile, **без tag**.

Ничего не merged в main; PR121 оставлен координатору. Не выполнены tag/release,
production mirror prepare/update/rollback, установка server script, сообщения Насте.
Доставка commits и зелёный isolated generator не считаются готовностью релиза.

## 1. Windows: найден конкретный blocker

Первый test-only CI:
<https://github.com/linkasu/linka.looks-electron/actions/runs/40893675943>,
head `b0f148e89f078af8b11f60113399dda615c186ef`.

**Не PASS всего Windows suite:** candidate 8 failures до step timeout, baseline
6 failures до step timeout; остальные тесты не выполнены. Но новый monitor
зафиксировал одинаковую конкретную цепочку в обеих версиях:

```text
CDP connected → app ready → window-created → loading
uncaught Error: spawn .../app/extraResources/bin/EyeLog.exe ENOENT
firstWindow timeout → teardown timeout
```

`resolveExtraResource` направлял development EyeLog в проектный `extraResources/bin`.
Действующий npm postinstall запускает только `electron-builder install-app-deps`;
старый `postinstall.js`, копировавший бинарники, больше не вызывается. Настоящий
EyeLog и DLL находятся в установленном `@linkasu/tobii-electron/extraResources/bin`.
У `eyelog/TobiiProcess` ошибка spawn не перехватывается, Electron показывает
необработанную startup ошибку. Это **существующий dev/harness resource blocker**,
а не доказанная регрессия генератора и не гипотеза «CDP не подключился».

Минимальное product-исправление: development `bin` после специальных macOS
helper/SDK путей разрешается из установленного пакета. Packaged path и defaultSets
сохранены. Все callers проверены: BackWatch и DEFAULT_SETS в CardsStorage.
Unit resolver: RED 1 failed/1 passed → GREEN 2/2; packaged path также проверен.
В одинаковом CI harness для baseline/candidate дополнительно подготовлен legacy
development layout **настоящими** EyeLog/DLL из того же пакета: baseline source
не переписан, аппаратный код не отключён, binaries не заменены mock/stub.
Общий Vite harness не запускает второй не изолированный Electron.

Даже до исправления dev layout **packaged Windows** прошёл:

- startup → явный V3 отказ → настоящий `app_version` IPC → editor storage save
  → завершение процесса → reopen с сохранёнными строками и consent;
- настоящий editor → generation IPC → PNG → отмена/repeated generation/discard
  → save → reopen, сохранение старой картинки, аудиобайтов/title/audio metadata.

Baseline packaged startup/storage: **1/1 PASS**; candidate packaged startup/storage:
**1/1 PASS**; candidate packaged generator user path: **1/1 PASS**.
Это реальные full-app probes, не isolated generator. В test-only `-p never`
пакетах отсутствует `app-update.yml`: лог updater ENOENT **не** выдаётся за
проверку подписанного инсталлятора или штатного обновления.

Второй exact-head CI после исправлений:
<https://github.com/linkasu/linka.looks-electron/actions/runs/40896522477>,
head **`74a050ac8b2d77d584466abce0d5fdf9c85fceab`**.
Candidate Windows **20/20 PASS**, macOS **20/20 PASS**, plain startup/packaged IPC
и оба packaged probes прошли на обеих платформах. Baseline тем же harness:
**10 PASS / 2 известных старых failures**, packaged startup/storage PASS.
Общий run FAILED: PR121 lane дал **19/20**, cold first-window consent assertion
исчерпал 5s до DOMContentLoaded; unit193+1skip и packaged probes PR121 прошли.
`firstTestWindow` теперь ждёт реальный DOMContentLoaded (20s bound), без sleep,
retry или изменения product consent. Не объявляется прошедшим старый красный run.
Следующий baseline gate проверяет JSON: ровно 10 PASS, ровно 2 известных failure
names, без skipped/flaky/global errors — произвольный сбой больше не допускается
через continue-on-error.
Этот run также отдельно checkout-проверяет точный PR121 head и baseline
`ae1392aa5c17b465a39ab61b12bab20858d8db8a`, без изменения их product source.

## 2. #85 / существующий PR121

PR: <https://github.com/linkasu/linka.looks-electron/pull/121>.
Head обновлён обычным non-force push в существующий fork:
**`9980f4fc2a09a9c480d96748f4ccbb0c2ef08160`**.
Он включает merge актуального main и новый `OutputLineGaze.spec.ts`.
Дублирующий PR/issue не создан, APPROVE-review не оставлен, PR не merged.

Root cause: lock был обычным gaze target; gaze-click отключал `button.enabled`,
после пересчёта исчезали gaze targets и пользователь не мог самостоятельно
продолжить. Существующий PR подходит: `eye-disabled` **только у OutputLine lock**.
Никаких глобальных изменений EyeButton, security или чужого UX.

Настоящие **OutputLine + EyeButton + PageWatcher**, synthetic tracker IPC:

- на точном main OutputLine RED: `enabled=false`, 1 failed/2 passed;
- с исправлением GREEN 3/3: gaze попытка lock не выключает управление,
  затем gaze активирует озвучивание вывода без мыши/клавиатуры;
- mouse и keyboard действительно выключают **и** включают lock;
- локальный полный unit PR121: **193 passed / 1 existing skipped**,
  format/lint/typecheck PASS. TTS замокан только на внешней границе.

Логи red/green скопированы в новые evidence. Автоматические GitHub checks на
fork push не появились; вместо выдуманного green PR статус проверяется отдельным
exact-checkout lane в test-only CI выше. Координатору: перед merge подтвердить
head SHA и проверить соответствующий lane/run, не подменять его старым check.

## 3. Две macOS E2E причины

Это test contract drift, подтверждённый сохранённым аудитом **до** правок:

1. Telemetry сохраняется в `telemetry-preference-v3.json`, schemaVersion 3,
   а тест читал legacy `config.json.telemetryConsent`. Обычный fixture также
   записывал только legacy consent, поэтому modal перекрывал sidebar.
2. Sidebar тест требовал полной видимости image-кнопки при максимальном scroll,
   а не пользовательской достижимости image/audio controls. Аудит packaged app
   подтвердил настоящее открытие/отмену обоих диалогов и выбор audio на
   800×600, 1024×768, 1366×768.

Исправлены fixtures и assertions, **не product consent и не skip**:
обычные contexts имеют явный V3 disabled; consent-тест начинает без выбора,
нажимает «Не отправлять» и ждёт async V3 persistence. Sidebar открывает/отменяет
image/audio диалоги и достигает audio file control во всех трёх viewport.

Полный локальный macOS suite: **20/20 PASS**, в том числе повтор на staging
версии 3.3.0; первый GitHub macOS candidate: **20/20 PASS**.
Packaged local 3.3.0 probes: **2/2 PASS**; build/package/resources прошли.
Первый новый probe ошибочно ожидал несуществующий текст «Главная» после reopen;
сохранён red log, исправлен на реальную карточку home, затем 2/2 PASS.
Это ошибка нового теста, не скрытый product-fix.

## 4. Зеркало

Точный source/provenance, схема atomic switch, ограничения, команды bootstrap,
dry-run и конкретный rollback:
[`docs/mirror-3.3-runbook.md`](docs/mirror-3.3-runbook.md).

Source updater на сервере не принадлежит найденному Git checkout: upstream repo
не выдуман. Версионируемый replacement — `scripts/mirror/update.cjs`, caller patch
в существующем publisher workflow. Production source/содержимое не менялись.

Новый алгоритм: pinned tag+asset+обязательный SHA → temp download → HTTP/size/hash/
version validation → fsync immutable versioned installer+manifest → atomic rename
единственного `current` symlink. До switch старая версия остаётся доступной;
все старые installers остаются. Rollback возвращает сохранённый pointer, не latest.

Локальные **14/14 tests PASS** проверяют interrupted stream/SIGKILL/download/hash/version failures,
старые bytes+manifest+version, concurrent writer, incomplete generation, dry-run,
switch+rollback, CLI через stdin и валидацию runner metadata. Никаких server writes.

**Реальный network dry-run:** опубликованный 3.2.13, 134378829 bytes,
SHA256 `4c5ada9fba8df88f0030b1c1fd52fe4f9851275eabcf64e21a1f4eecb1fef764`.
Первый unauthenticated API fetch получил HTTP403, pointer не менялся.
После минимального исправления transport тот же CLI **через stdin** получил
metadata через существующий `gh`, а binary скачал обычным native fetch;
hash/size проверены, dryRun=true, current не изменён.
Workflow использует уже существующий `github.token` только на runner, передаёт
на сервер metadata, **не credentials**. Повторно валидирует tag/state/asset/digest.

3.3.0 ещё не опубликована, её download dry-run не заявляется. Реальный nginx
bootstrap/HTTP/rollback и power-loss на production FS не проверены; это
отдельный контролируемый этап после review, не повод запускать update сейчас.

## 5. Точный итог TTS из аудита

- **#120 / PR123:** при раннем refresh ещё действительного токена (остаток 1h)
  network failure в `tts.ts:81–97` прерывает synthesize **до** anonymous request.
  Подтверждено synthetic тестом. P1 **если включён token-TTS**, но штатный Vite
  default — false, release workflows флаг не задают, в собранном renderer нет
  `tts:anonymous`. Поэтому отдельный TTS fix не включён в 3.3 scope, PR123 не merged.
  Не включать token mode до отдельного исправления причины/проверки fallback.
- **#126:** два разных текста/голоса посылают одинаковый installation UUID как
  Idempotency-Key. Возможны чужой результат/конфликт **если** backend дедуплицирует
  по нему. Фактический backend handler/contract **не установлен**: OpenAPI 404,
  просмотренные локальные backend проекты и GitHub search не дали handler.
  Это не доказательство отсутствия API и не разрешение изобретать контракт.
  Точный handler/spec нужен владельцу только если включается token mode;
  default 3.3 mode не менялся.

## Решение координатору

Пока **не tag/release**. Сначала завершить exact-head CI и review PR133/PR121,
merge выполняет координатор; затем проверить **точный объединённый main SHA**
и артефакты 3.3.0 штатными gates. Раздельные проверки PR не заменяют этого шага.
После review — отдельно подготовить зеркало и проверить HTTP старой generation,
затем допуск release/signing/installation и штатного publisher.

T9 #130 вне релиза. #129 остаётся ограничением: resize не auto-reflow, фразу
вводят снова; старые referenced image/audio/title сохраняются. Не расширял scope.
Физического Tobii нет: synthetic gaze **не** аппаратная приёмка; это честная
граница, не единственный вечный blocker. Также не заявлены NSIS/dmg installation,
подпись/notarization, реальные аудио/слуховые испытания, downgrade и crash-atomic
финальный `CardsStorage.saveSet copyFile` — соответствующие ограничения аудита
не исчезли. Существующие dependency advisories не обновлялись автоматически.
