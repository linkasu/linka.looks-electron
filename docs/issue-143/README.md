# Issue #143 — локальная UX-доработка

## Основа и границы

- Issue: https://github.com/linkasu/linka.looks-electron/issues/143 (прочитана вместе с комментариями).
- Исходный репозиторий: `/Volumes/data/linka/linka.looks-electron`.
- Рабочая ветка: `feat/calm-accessible-ux`, HEAD `fad3a19b9e7517208f1d6e9be286dbd0afecac85`.
- Worktree изменений: `/Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux`.
- Worktree исходных снимков: `/Volumes/data/linka/.opencode-worktrees/looks-143-before`, detached HEAD того же коммита.
- База существующего редизайна: `ae1392aa5c17b465a39ab61b12bab20858d8db8a`.
- Удалённый `main`, независимо проверенный через `git ls-remote` и `git fetch origin main`: `1cd6fcbc0b208705f4ad45138b0b7f8e8a2b8bd0`.
- Несвязанные незакоммиченные изменения исходного каталога не переносились и не изменялись. Коммит, push, PR, слияние, релиз и деплой не выполнялись. PR #125 не изменялся.

## Наблюдения → изменения

1. В списке наборов действие редактирования отсутствовало в меню. Для него требовалось открыть набор, затем инструменты помощника. Добавлен прямой пункт «Редактировать набор»; в просмотре то же действие вынесено из инструментов в панель. Все остальные действия сохранены. Во время настройки отображения переход в редактор недоступен, чтобы не пересекать два режима редактирования.
2. Создание набора обозначалось только знаком «+». На широком экране добавлена текстовая подпись. На узком экране остаются иконка, доступное имя и подсказка.
3. Enter на кнопке действий списка не открывал меню в реальном Electron-прогоне: глобальный обработчик AAC в установленном `PageWatcher` перехватывал клавишу. События клавиатуры кнопки/меню теперь остаются в инструментах специалиста. Самодельное позиционированное меню заменено штатным Vuetify; проверяются фокус, стрелки, Escape и возврат к исходной кнопке. Карточки и возврат в родительскую папку недоступны на время меню/диалога помощника; пользовательская настройка паузы не изменяется.
4. В панели карточки копирование и сброс имели яркие заливки и тени, конкурируя с сохранением. Это теперь второстепенные текстовые иконки; подтверждение сброса сохранено. Заголовок показывает номер карточки, блоки названы «Изображение» и «Озвучка», тени вложенных кнопок заменены тонкой границей, согласованы интервалы. Подсказка озвучки больше не приглушена дополнительной прозрачностью.

Это наблюдения по интерфейсу и автоматизированному сценарию, не результаты исследования удобства с реальными специалистами. Общие настройки уже сгруппированы существующим редизайном; их структура без доказанной необходимости не менялась. Новых функций, схем хранения, библиотек или способов gaze-ввода нет.

### Точные файлы существующего UX-варианта

- `src/frontend/views/HomeView.vue`: прямое редактирование из меню, штатный `v-menu`, клавиатурная навигация и возврат фокуса; блокировка карточек и возврата в папку на время действий помощника.
- `src/frontend/views/HomeView.appbar.vue`: подписанная кнопка «Создать набор», компактное представление подписей на узком экране.
- `src/frontend/views/SetExplorerView.appbar.vue`: прямой переход к редактированию в панели просмотра вместо вложенного пункта инструментов; недоступен при настройке отображения.
- `src/frontend/views/EditorView.vue`: заголовок «Карточка N», второстепенные копирование/сброс, короткие названия разделов, границы вместо теней, интервалы и читаемая подсказка озвучки.
- `src/frontend/components/EditorView/SetSettings.vue`: текстовая подпись «Настройки набора», скрываемая на узком экране при сохранении доступного имени.

Сопровождающие существующие изменения тестов: `src/frontend/tests/unit/EditorDestructiveActions.spec.ts`, `src/frontend/tests/unit/HomeView.spec.ts`, `src/frontend/tests/unit/SetExplorerAppbar.spec.ts`, `tests/e2e/electron.spec.ts`, `tests/e2e/helpers.ts`, `tests/e2e/visual-refresh.spec.ts`, новый `tests/e2e/specialist-ux.spec.ts`. Исправленный до продолжения селектор в `electron.spec.ts` проверяет `.inspector-title` / «Карточка 1» вместо устаревшего заголовка. В ограниченном продолжении продуктовые файлы и тесты не редактируются.

## Сценарии и доказательства

`tests/e2e/specialist-ux.spec.ts` запускает настоящий Electron с отдельными временными файлами и профилем, использует картинки из поставляемого набора «Фраза». Внешняя озвучка подменена тестовым ответом. Проверяется путь: список → повторное открытие/закрытие меню → контекстное меню правой кнопкой → отмена переименования → редактор → повторное сохранение → отмена выхода → выход без сохранения → повторное открытие сохранённого состояния → настройки → две активации пробной карточки → коммуникационный набор → компактный редактор и настройки набора.

Измерено в Electron: текст меню на белом — **13,04:1**, вспомогательный текст на фактическом фоне `rgb(246, 247, 244)` — **5,61:1**, цвет рамки клавиатурного фокуса относительно белого — **5,59:1**. Проверяются рамка фокуса не тоньше 2 px и кнопка действий не меньше 44×44 px. Проверены Enter, стрелка вниз, Escape и восстановление фокуса после меню/отмены диалога. Размеры/контраст пользовательских палитр не покрыты.

| Экран                                       | До (`fad3a19`)                  | После                             |
| ------------------------------------------- | ------------------------------- | --------------------------------- |
| Список наборов                              | [до](before/sets.png)           | [после](after/sets.png)           |
| Действия с набором                          | [до](before/set-actions.png)    | [после](after/set-actions.png)    |
| Редактор, 1280×800                          | [до](before/editor.png)         | [после](after/editor.png)         |
| Редактор, 800×600                           | [до](before/editor-compact.png) | [после](after/editor-compact.png) |
| Коммуникационный набор                      | [до](before/communication.png)  | [после](after/communication.png)  |
| Общие настройки (без продуктовых изменений) | [до](before/settings.png)       | [после](after/settings.png)       |

На компактном снимке «после» и в коммуникации название карточки изменено самим проверяемым сценарием сохранения. Исходные изображения существующего редизайна в `docs/visual-refresh/` сохранены; дополнительный gaze/quiz/match-прогон пишет в `regression/` через `UX_SCREENSHOT_DIR`.

## Проверки исходного этапа (история)

Node `v22.22.2`, npm `10.9.7`. Зависимости установлены через `npm ci --ignore-scripts --no-audit --no-fund`, затем штатно выполнены `node node_modules/electron/install.js` и `npm --prefix node_modules/pictures.bank-api run build`. До последней команды Vite возвращал 500 для диалога банка картинок; первые UI-прогоны не являются успешными проверками приложения. Попытка повторной съёмки baseline с общим symlink `node_modules` завершилась тайм-аутом; после отдельной установки baseline-прогон прошёл.

- `npm run lint` — PASS.
- `npm run typecheck` — PASS.
- `npm run test:unit` — 146 frontend PASS, 1 SKIP (альтернативный режим TTS по флагу installation tokens); 25 node PASS.
- `npm run build` — PASS, предупреждение о чанке более 500 kB; установщик не собирался.
- `npm run format:check` — PASS; изменённые после общего прогона файлы дополнительно форматировались/проверялись.
- `git diff --check` — PASS.
- Baseline UI-съёмка — PASS.
- Полный Playwright-прогон — 14 PASS, 1 FAIL: прежний тест прокрутки панели искал удалённый заголовок «Редактирование». Заменён на проверку контекста «Карточка 1». После правки повторены все затронутые UI-сценарии: **4 PASS, 0 FAIL**, команда `npx playwright test --grep 'editor side panel|specialist preparation|calm visual refresh|task examples' --reporter=line` с теми же переменными ниже. Полный набор повторно не запускался: остальные 11 сценариев прошли ранее и последними правками не затронуты.

Дополнительный visual-refresh прогон проверил очистку/возврат сообщения, gaze-паузу и IPC-возобновление, блокировку карточек в инструментах помощника, обе сохранённые dwell-индикации, настройки при 200% масштабе, викторину до завершения и неверную/верную пару. Снимки меню, редактора, коммуникации, настроек, паузы, викторины и соотнесения просмотрены агентом. Это просмотр реального UI и автоматизация, а не ручная приёмка специалистом. Перед финальной фиксацией отчёта повторены production build, точечный ESLint и typecheck. Тестовые окна закрыты; запущенный тестами Tobii helper без подключённых клиентов остановлен обычным SIGTERM, без изменения конфигурации службы.

Команда UI (все переменные профиля относятся только к тестовым данным):

```sh
PATH=/Users/aacidov/.nvm/versions/node/v22.22.2/bin:$PATH \
UX_SCREENSHOT_DIR=docs/issue-143/regression \
E2E_DEV_SERVER_URL=http://localhost:5183 \
E2E_REMOTE_DEBUGGING_PORT=9432 \
E2E_TEST_ELECTRON_REMOTE_DEBUGGING_PORT=9433 \
IS_TEST=1 \
LINKA_HOME_DIR=/private/var/folders/l4/r3plyjwj7pz_nq7zz50x04880000gn/T/opencode/looks-143-server-home \
TEST_USER_DATA_DIR=/private/var/folders/l4/r3plyjwj7pz_nq7zz50x04880000gn/T/opencode/looks-143-server-profile \
npx playwright test --reporter=line
```

## Ограниченное продолжение верификации — 2026-11-01

Продолжение выполнено в том же изолированном worktree `looks-143-calm-ux`, ветка `feat/calm-accessible-ux`, HEAD `fad3a19b9e7517208f1d6e9be286dbd0afecac85`. Перед запуском `lsof -nP +D /Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux` показал только оставшиеся MCP-процессы с cwd/read-дескрипторами, без открытых на запись файлов, тестовых или сборочных процессов. Активного writer не обнаружено; предоставленный владельцем terminal исходной задачи также сообщает завершение. Чужие процессы не останавливались.

Среда: macOS 27.0.1 arm64, Node `v22.22.2`, npm `10.9.7`. Зависимости повторно не устанавливались. Старые `before/`, `after/` и `regression/` сохранены; новые доказательства отделены в `verification-2026-11-01/`.

Повторно выполнены команды из корня worktree с `PATH=/Users/aacidov/.nvm/versions/node/v22.22.2/bin:$PATH`:

- `npm run format:check` — PASS; повторён после финального дополнения и форматирования документов/JSON-доказательств.
- `npm run lint` — PASS.
- `npm run typecheck` — PASS.
- `npm run build` — PASS; предупреждение о минифицированном чанке больше 500 kB, установщик не собирался.
- `npm run test:unit` — 28 frontend-файлов, **146 PASS, 1 SKIP**; 5 node-файлов, **25 PASS**. Единственный SKIP — существующий альтернативный тест `sends only text and voice to the main process when installation tokens are on` при выключенном `TTS_INSTALLATION_TOKENS_ENABLED`, не новый skip и не обход ошибки.
- `npx playwright test --reporter=line,json` — **15 PASS, 0 FAIL, 0 SKIP, 0 flaky**, все с первой попытки, 1 worker, 336,746 с (5 мин 37 с). Это новый полный прогон всех трёх spec-файлов на текущем UX и уже исправленном селекторе, а не прежний частичный результат 4/4. Запуск 15:12:59–15:18:36 +03:00. Исправления тестов в продолжении не понадобились.
- `git diff --check` — PASS; повторён после финального отчёта.

Все 15 сценариев полного прогона — PASS:

| Файл                     | Сценарий                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `electron.spec.ts`       | existing activation still requires an explicit telemetry choice                               |
| `electron.spec.ts`       | editor settings expose row and column controls                                                |
| `electron.spec.ts`       | editor side panel scrolls to audio controls                                                   |
| `electron.spec.ts`       | assistant settings page scrolls within the main content area                                  |
| `electron.spec.ts`       | gaze set explorer keeps page scrolling disabled                                               |
| `electron.spec.ts`       | set explorer grid fills the viewport above footer                                             |
| `electron.spec.ts`       | home grid keeps the last row above the footer                                                 |
| `electron.spec.ts`       | standard set appends clicked cards to text output                                             |
| `electron.spec.ts`       | standard set preserves typed output while turning pages                                       |
| `electron.spec.ts`       | quiz set handles wrong and correct answers                                                    |
| `electron.spec.ts`       | match set handles wrong and correct pairs                                                     |
| `electron.spec.ts`       | editor saves changed page settings to set archive                                             |
| `specialist-ux.spec.ts`  | specialist preparation: sets, card editing, settings and communication                        |
| `visual-refresh.spec.ts` | calm visual refresh preserves both roles and captures the real screens                        |
| `visual-refresh.spec.ts` | task examples show the fourth quiz question and matching choices without communication output |

Измерения повторились: текст меню 13,0389:1, вспомогательный текст 5,6110:1, рамка фокуса 5,5851:1. В логе dev server присутствуют первоначальный `ENOENT` сокета Tobii helper, SSL handshake `net_error -7` и deprecation warnings `fs.F_OK` / `crypto.fips`; они не привели к падению тестов, но доступность реальных внешних сервисов этим прогоном не подтверждается. Внешний TTS замокан тестами.

Проверка SHA-256 после прогона: среди всех существовавших на старте git-tracked и неигнорируемых untracked файлов изменился только этот README. Продуктовые файлы, тесты и исходные screenshots неизменны. Новые файлы ограничены доказательствами в `docs/issue-143/verification-2026-11-01/`. Просмотрены новые снимки меню и редактора в обоих размерах. Тестовые окна закрыты; два запущенных прогоном Tobii helper без клиентов остановлены SIGTERM после проверки PID/команд, конфигурация службы не менялась. Первый read-only диагностический вызов `lsof` не декодировал постороннее имя как UTF-8 и был повторён с replacement decoding; до повторной диагностики сигналы не отправлялись. Это не сбой тестов.

### Абсолютные пути основных снимков

| Экран                          | До (сохранённый baseline)                                                                            | После (новый полный прогон)                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Список наборов                 | `/Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux/docs/issue-143/before/sets.png`           | `/Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux/docs/issue-143/verification-2026-11-01/after/sets.png`           |
| Меню действий                  | `/Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux/docs/issue-143/before/set-actions.png`    | `/Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux/docs/issue-143/verification-2026-11-01/after/set-actions.png`    |
| Редактор 1280×800              | `/Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux/docs/issue-143/before/editor.png`         | `/Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux/docs/issue-143/verification-2026-11-01/after/editor.png`         |
| Редактор 800×600               | `/Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux/docs/issue-143/before/editor-compact.png` | `/Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux/docs/issue-143/verification-2026-11-01/after/editor-compact.png` |
| Коммуникационный набор         | `/Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux/docs/issue-143/before/communication.png`  | `/Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux/docs/issue-143/verification-2026-11-01/after/communication.png`  |
| Общие настройки, без UX-правок | `/Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux/docs/issue-143/before/settings.png`       | `/Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux/docs/issue-143/verification-2026-11-01/after/settings.png`       |

Дополнительные 20 снимков gaze/quiz/match/settings сохранены в `verification-2026-11-01/regression/`; полный список абсолютных путей всех новых снимков и их SHA-256 — `verification-2026-11-01/screenshots.json`.

Точная команда полного E2E (профили относятся только к тестовым данным):

```sh
PATH=/Users/aacidov/.nvm/versions/node/v22.22.2/bin:$PATH \
UX_EVIDENCE_STAGE=verification-2026-11-01/after \
UX_SCREENSHOT_DIR=docs/issue-143/verification-2026-11-01/regression \
E2E_DEV_SERVER_URL=http://localhost:5183 \
E2E_REMOTE_DEBUGGING_PORT=9432 \
E2E_TEST_ELECTRON_REMOTE_DEBUGGING_PORT=9433 \
IS_TEST=1 \
LINKA_HOME_DIR=/private/var/folders/l4/r3plyjwj7pz_nq7zz50x04880000gn/T/opencode/issue143-verify-5785/server-home \
TEST_USER_DATA_DIR=/private/var/folders/l4/r3plyjwj7pz_nq7zz50x04880000gn/T/opencode/issue143-verify-5785/server-profile \
PLAYWRIGHT_JSON_OUTPUT_NAME=/Volumes/data/linka/.opencode-worktrees/looks-143-calm-ux/docs/issue-143/verification-2026-11-01/full-e2e.json \
npx playwright test --reporter=line,json
```

Логи каждой команды, коды возврата и время: `verification-2026-11-01/*.log`, `verification-2026-11-01/results.json`. Среда и SHA-256 исходников/тестов: `verification-2026-11-01/environment.json`. JSON Playwright сохраняется отдельно от человекочитаемого лога.

## Ограничения и совместимость с main

Это изменения старой дизайн-ветки, **не готовая к слиянию с актуальным main сборка**. Проверка `git merge-tree --write-tree HEAD origin/main` (без изменения рабочего дерева) выявила 11 конфликтующих файлов: lockfile, backend card storage, ExitButton, InputDialog, OutputLine, LINKaStore, CardsStorage/OutputLine unit-тесты, панель редактора и e2e electron/helpers. Конфликтное слияние не начиналось. Функциональные и security-обновления актуального main не откатывались, но в эту старую ветку автоматически не переносились; тесты дизайн-ветки не доказывают их совместимость. Перед публикацией нужна отдельная интеграция с сохранением обновлений #123 → #122 → #124 и последующие проверки. Замена main этой веткой недопустима.

Настоящий Tobii, физический джойстик, экранный диктор, Windows/Linux и сборка установщика не проверялись. Автоматизированные IPC/gaze-события не заменяют проверку на оборудовании. Измерения контраста и размеров относятся только к конкретным проверенным элементам и стандартной палитре, не являются заявлением о полной WCAG-сертификации. Публикация и закрытие issue не выполнены.
