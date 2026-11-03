# Квалификация релиза 4.0.0

Статус: **NO-GO**. Локальные исправления подготовлены; проверки и ограничения
перечислены ниже. Этот документ не подтверждает публикацию релиза.

## Исходная точка

- Локальная база: `v3.3.1`, `321e92fd43b552cb3b5eb973e65f4e64434a71fd`.
- Исходный HEAD: `c540646e1bf06d5f4ea76d6db6b2ab1b82bfe89b`.
- Рабочая ветка: `release/400-qualification-local`.
- Исходный checkout не изменяется; работа выполняется в отдельном worktree.
- GitHub MCP подтвердил опубликованный `v3.3.1` и его исходный tag SHA;
  Windows installer: 148213565 байт, SHA-256
  `6104675c084f502e1fdbc6f6c68487d8ccff47f3e39529e4358964452f027735`.

## Текущее закрытие плана

- Цель: **Windows 10 22H2 / Windows 11 x64, unsigned, CI-only**. Физические устройства
  и реальные клиентские ОС по решению владельца — **NOT TESTED**, не PASS.
- macOS остаётся на опубликованных байтах 3.3.1. Проверен updater protocol с настоящим
  `latest-mac.yml`; новый 4.0.0 переносит только закреплённые compatibility assets.
- Tobii **v0.2.17 опубликован**, source merge `ae20f599874f3f8bd3eb014f0f2589854460f8d4`.
  Windows/Linux/macOS CI и Release/Publish успешны. TGZ SHA-256
  `10a66998baa78e273a5d33ce183f2a18d22bd660561dcd07e5662d5cfc292fb2`.
  Приложение закрепляет публичный TGZ/SRI; joystick regression: **30/30 PASS**.
- Права SDK AAC/reusable package подтверждены владельцем («Разрешение есть»).
  Это owner attestation, не независимое юридическое заключение. Matching corresponding
  source встроенного TobiiFree WASM включён в пакет; бинарь не изменён.
- Свободное имя копии: storage **18/18**, editor/store **57/57**. Запрос имени не
  резервирует файл; фактическое сохранение остаётся atomic create-only/no-clobber.
- Vue 3.5.44; чистый `npm ci --ignore-scripts` и whitelisted provisioning успешны.
  `.npmrc` закрепляет `install-links=true`; optional native addon не установлен,
  Windows default EyeLog и безопасный fallback сохранены.
- Post-pin production audit: **6 moderate, 0 high/critical**. Source reachability
  разобрана в [security/release-400-audit.md](security/release-400-audit.md);
  окончательный signoff требует inventory настоящего установщика.
- Native predictor Windows CI [41699527926](https://github.com/linkasu/linka.predictor-rust/actions/runs/41699527926)
  успешен: JSON, empty/16KB query, ошибки модели и DLL imports. EXE SHA-256
  `ca6bce73b7ecf95b79bc5606b2807bac55fd0c8eebdaf24f5491f058ba5db63c`.
  Это runtime candidate, **не production approval**.
- FINAL заморожен отдельно: 530 строк / 525 кураторских групп, AI-synthetic, не
  клиническое исследование AAC. Training получает только hash-only exclusions.
  Реальные source review, обучение, DEV/FINAL inference и Windows model performance
  **ещё не выполнены**; синтетические selfchecks не заменяют эти gates.
- `build/predictor-approval.json` намеренно отсутствует. Установщик, genuine upgrade
  и app 4.0.0 release остаются **BLOCKED** до реальных принятых артефактов.

### Повторный software gate после исправлений

Локально macOS arm64, Node 22.22.2; это не проверка установщика Windows:

| Проверка                                  | Результат                                                        | Evidence в `release-evidence/400/`                             |
| ----------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| Renderer unit                             | 401 PASS / 1 SKIP                                                | `closure-renderer-unit.log`                                    |
| Main/storage unit                         | 141 PASS                                                         | `closure-main-unit.log`                                        |
| Typecheck / lint                          | PASS                                                             | `closure-typecheck.log`, `closure-lint.log`                    |
| Knip                                      | PASS после привязки тестов к зависимостям их фактических callers | `closure-knip-recheck.log`                                     |
| Portable CI controls                      | 194 PASS / 2 SKIP                                                | `closure-portable-ci-controls.log`                             |
| Python payload/evidence negative controls | PASS                                                             | `closure-{asar-evidence,report-evidence,payload-controls}.log` |
| Browser / built-file Electron E2E         | 36 PASS                                                          | `closure-e2e.log`                                              |

Windows-only process controls и исторический backport fixture требуют собственного
стенда/параметров и не входят в portable run. Их отказ при попытке общего wildcard
запуска сохранён в `closure-ci-controls.log`; guards не отключались. SKIP не PASS.

## Подтверждённые требования

- Копия получает отдельное имя; существующий файл и оригинал нельзя молча перезаписать.
- Сохранение копии не меняет baseline оригинала. Новые правки во время записи остаются
  несохранёнными в редакторе оригинала.
- Пауза блокирует ввод, но не обещает замораживание начатой речи и автопереходов задания.
  Отдельная команда Stop останавливает речь в клавиатуре.
- Клавиатура работает в основном окне: только компоновка C, RU с предиктором, EN вручную.
- Текст и code-point-позиция курсора сохраняются вместе; история Undo эфемерна.
- Реальные пользовательские данные, разрешения устройств, secrets и боевой feed не меняются.
- Отсутствующие стенды, approved-модель и артефакты отмечаются BLOCKED, а не PASS.

## Исторический локальный checkpoint до закрытия плана

Таблица ниже сохранена как исходный checkpoint; актуальные изменения и снятые
блокеры перечислены выше. Она не является приёмкой текущих байтов.

| Задание         | Статус                     | Область                                                                                   |
| --------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| REL-01          | PARTIAL                    | Локальные tag/SHA подтверждены; published release BLOCKED                                 |
| REL-02          | PASS local                 | Node 22.22.2 / npm 10.9.7, чистые locked dependencies, pinned Rust 1.98.0 и test sidecar  |
| REL-03          | PASS local                 | Версия, inventory, notes и релизный контракт 4.0.0; внешняя публикация не выполнялась     |
| REL-04          | PARTIAL / BLOCKED          | Static approval gate и negative controls готовы; production model/hashes не предоставлены |
| EDT-01          | PASS focused               | Библиотека и папки; исправлена гонка A→B→A                                                |
| EDT-02          | PASS focused               | Ownership в store, coherent-ready, stale success/error и ABA                              |
| EDT-03          | PASS safety / PARTIAL UX   | No-clobber и baseline защищены; default «копия» не гарантированно свободен                |
| EDT-04          | PASS focused               | Страницы и карточки редактора                                                             |
| EDT-05          | PASS focused               | ZIP, staging, конкурентные create-only и сохранность медиа                                |
| EDT-06          | PASS focused               | Разделены ошибки категорий и поиска                                                       |
| EDT-07          | PASS focused               | Retry/поздний результат картинки не применяется к другой карточке                         |
| EDT-08          | PASS focused               | Диалог озвучки; реальный сетевой синтез и слышимое аудио не проверены                     |
| INP-01          | PASS focused               | EyeButton, mouse toggle, подсветка и pause/resume                                         |
| INP-02          | FAIL / BLOCKED             | Joystick-only отвергается upstream PageWatcher 0.2.16; обычный regression остаётся red    |
| INP-03          | PASS focused               | Обновляется identity заменённых DOM-целей; проверены observers, batching, стрелки         |
| INP-04          | PASS focused               | Сообщение/restore; ошибка озвучки больше не уходит в необработанный rejection             |
| INP-05          | PASS focused               | Викторина: busy, диалоги, ошибки TTS и lifecycle                                          |
| INP-06          | PASS focused               | Первый выбор сохраняется, many-to-many и счётчики                                         |
| KEY-01          | PASS focused               | Модель редактирования                                                                     |
| KEY-02          | PASS focused               | Черновик и ошибки хранилища                                                               |
| KEY-03          | PASS focused               | Асинхронный UI клавиатуры, ABA и EN                                                       |
| KEY-04          | PASS real tiny             | Настоящие subprocess completions и Unicode/context/suffix                                 |
| KEY-05          | PARTIAL                    | Lifecycle с настоящим test sidecar проверен; production performance BLOCKED               |
| KEY-06          | PASS scoped                | Browser и built-file Electron геометрия клавиатуры/курсора                                |
| UX-01           | PASS focused               | Настройки, bindings, голоса                                                               |
| UX-02           | PASS UI / BLOCKED hardware | Поздние IPC после отмены изолированы; backend-команда не отменяется                       |
| UX-03           | PASS focused               | Ровно шесть цифр, consent и home-only объявления; реальные сервисы не проверены           |
| UX-04           | PASS focused               | Snapshot/live race, ошибки invoke, явный restart и независимые владельцы modal-блокировки |
| PKG-01          | BLOCKED                    | Windows x64: не предоставлены стенд и CI-пакет                                            |
| PKG-02          | BLOCKED                    | macOS arm64: не предоставлен финальный CI-пакет                                           |
| PKG-03          | BLOCKED                    | macOS x64: не предоставлены Intel-стенд и CI-пакет                                        |
| PKG-04          | BLOCKED                    | Windows upgrade: нет настоящих old/new артефактов и стенда                                |
| PKG-05          | BLOCKED                    | macOS arm64 upgrade: нет настоящих old/new артефактов                                     |
| PKG-06          | BLOCKED                    | macOS x64 upgrade: нет артефактов и Intel-стенда                                          |
| QLT-01          | PARTIAL                    | Общий UI, локальные иконки и geometry прошли E2E; полного WCAG/OS-offline/hardware нет    |
| QLT-02          | PASS bounded               | 50 циклов / 100 входов, один Electron process; это не многочасовая аппаратная нагрузка    |
| PKG-L1 / PKG-L2 | NOT RUN                    | Условные задания: Linux не подтверждён как цель релиза                                    |

## Правила доказательств

- PASS относится только к указанным командам, среде и проверенному состоянию кода.
- SKIP не является подтверждением функции.
- Browser demo не квалифицирует Electron IPC, диск, TTS, hardware или production model.
- Built-file Electron не является проверкой установленного пакета.
- Исторические логи и подписи не квалифицируют новый артефакт.
- Тестовые логи и отчёты сохраняются в ignored `release-evidence/400/`.

## Исторические локальные проверки

Команды выполнялись на macOS arm64, Node 22.22.2, npm 10.9.7, с чистыми locked
зависимостями и закреплённым test sidecar. Проверялось рабочее дерево поверх исходного
SHA, не опубликованный или подписанный артефакт. Изменения не закоммичены.

| Проверка                                     | Результат                                                  | Evidence в `release-evidence/400/`               |
| -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `npm run format:check`                       | PASS                                                       | `final-format.log`                               |
| `npm run lint`                               | PASS, 0 errors / 1 прежний unused-variable warning         | `final-lint.log`                                 |
| `npm run typecheck`                          | PASS после исправления двух типизированных test fixtures   | `final-typecheck.log`                            |
| `npm run knip`                               | PASS                                                       | `final-knip.log`                                 |
| Renderer unit, `vitest run --maxWorkers=1`   | 397 PASS / 1 FAIL / 1 SKIP                                 | `final-renderer-unit.log`                        |
| Main/storage unit, Node config, workers=1    | 138 PASS / 0 SKIP                                          | `final-main-unit.log`                            |
| Повтор двух затронутых fixture suites        | 15 PASS                                                    | `final-fixture-focused.log`                      |
| CI node controls после review                | 93 PASS / 1 SKIP                                           | `final-ci-controls-recheck.log`                  |
| ASAR inventory suite, пять повторов          | 5/5 successful runs                                        | `final-inventory-repeat.log`                     |
| Python ASAR/report/payload negative controls | 15 + 19 + 11 PASS                                          | `primary-ci-controls.md`                         |
| Standalone keyboard/caret browser            | 15 + 3 PASS                                                | `ui-key06-summary.md`                            |
| Built-file typing Electron                   | 6 PASS до добавления stress-сценария                       | `ui-key06-summary.md`                            |
| `npm run test:e2e`, финальный код приложения | 36 PASS / 0 SKIP, 2.9 min                                  | `final-e2e.log`                                  |
| Повтор после изоляции visual outputs         | 3 PASS; historical PNG не изменены                         | `final-visual-isolation.log`                     |
| Bounded lifecycle stress                     | 50 циклов / 100 входов, stable listeners и window identity | `ui-qlt02-lifecycle-summary.md`                  |
| USB native load в Electron 43.8.4            | PASS; без enumerate/open устройств                         | Локальный CLI smoke                              |
| Production resource gate без approval        | Ожидаемый FAIL / BLOCKED, exit 1                           | `final-production-approval-blocked.log`          |
| Dependency audit, production tree            | FAIL, 11 findings                                          | `npm-audit-production.json`, `security-audit.md` |

Unit suites запускались отдельно, чтобы известный renderer failure не скрыл main suite
из-за `&&` в `npm run test:unit`. Единственный renderer FAIL — обычный joystick-only
regression через настоящий PageWatcher. Пропуски не считаются PASS.

Во время review добавлен и исправлен ещё один red-case: unmount просмотрщика, уже
освободившего свой owner, не должен инвалидировать загрузку нового редактора.
Focused-повтор: 64 PASS (`primary-load-owner-{red,green}.log`). Инвариант release inventory
не ослаблен: missing-metadata fixture создаётся отдельным валидным ASAR, а отказ по
отсутствию metadata остаётся обязательным.

Визуальные E2E первоначально обновили 26 исторических PNG. Новые снимки сохранены в
`final-visual/`, исходные tracked PNG восстановлены побайтово из исходного HEAD.
Тесты теперь по умолчанию пишут screenshots в ignored outputs; явные параметры
генерации документальных скриншотов сохранены.

Счётчики разных строк могут включать одни и те же тесты; складывать их в общий итог нельзя.

## Текущие блокеры

- Reviewed source/content record, успешное обучение U (T опционален), DEV selection
  и committed run-freeze до FINAL; затем canonical UI_KSR_V1 и Windows performance.
- Production approval должен закрепить `win32-x64` и ровно четыре публичных ресурса:
  `model.lpk`, `lp-electron.exe`, `LICENSE`, `MODEL_NOTICE.md`, их размеры и hashes.
  Отсутствие approval — failure, не warning; tiny model не fallback.
- Финальные source/tooling SHA, software quality gate, Windows installer inventory,
  residual security signoff и genuine upgrade с опубликованного v3.3.1.
- Воспроизводимый долговечный source snapshot требует отдельного content/redistribution
  review; weekly URL не считается постоянным воспроизводимым входом.

## Ограничения тестового окружения

- Все локальные Electron E2E используют изолированные userData/home и synthetic native
  tracker acquisition. Реальный BackWatch IPC/геометрия остаются, физическая приёмка не заявляется.
- Rust toolchain, build target и Cargo cache установлены только в ignored рабочем каталоге.
- Electron lazy install использовал пользовательский download cache; это зафиксировано
  в отчёте окружения. Рабочие приложения и глобальные toolchain/config не менялись.
- Сохранение копии требует hard-link support в файловой системе назначения. При отсутствии
  поддержки операция безопасно отказывает, без fallback с перезаписью.

## Оставшиеся условия выпуска

- Получить утверждённые production model/sidecar, SHA-256, лицензии и архитектуры.
- Выполнить чистый итоговый quality gate после review всех исправлений.
- Получить CI-пакеты финального SHA; проверить ресурсы и обычный запуск. Отсутствие
  подписи явно принято владельцем; аппаратные и клиентские OS checks не заявлять PASS.
- Выполнить настоящие обновления, не подменяя их сборкой одного checkout под двумя номерами.
- Выпустить принятые байты по уже полученному поручению владельца, без перезаписи
  опубликованных версий; сохранить все перечисленные gates и NOT TESTED ограничения.
