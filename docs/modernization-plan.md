# План модернизации стека

Документ фиксирует статус модернизации стека и оставшиеся этапы после перехода проекта на npm, Node 22, Vite, свежий Electron, Vue и тестовую инфраструктуру. Цель плана - сохранять изолированные этапы, чтобы источник каждой поломки был понятен.

## Цели

- Сохранять npm как package manager.
- Сохранять Node 22 LTS как runtime baseline.
- Поддерживать Vite-сборку Electron-приложения без Vue CLI и `vue-cli-plugin-electron-builder`.
- Поддерживать актуальный Electron, packaging и updater stack.
- Поддерживать Vue, Vuetify, TypeScript, ESLint и unit-тесты на текущих версиях.
- Сохранить поведение приложения, installer, file associations и auto-update.
- Не смешивать крупные миграции в один PR.

## Текущее состояние

- Node: `v22.22.2` в `.nvmrc`.
- npm используется как основной package manager.
- Package manager: `npm@10.9.7` в `packageManager`.
- Lockfile: `package-lock.json`.
- `yarn.lock` отсутствует.
- Сборка renderer: Vite через `vite.config.ts`.
- Electron integration: `vite-plugin-electron` и `vite-plugin-electron-renderer`.
- Electron main entry: `src/electron/main.ts`, output `dist-electron/main.js`.
- Renderer entry: `index.html` -> `src/frontend/main.ts`, output `dist`.
- Vue: `3.5.x`.
- Vue Router: `4.6.x`.
- Vuex: `4.1.x`.
- Vuetify: `3.12.x`.
- TypeScript: `5.9.x`.
- Electron: `42.x`.
- electron-builder: `26.x`.
- electron-updater: `6.8.x`.
- Unit tests: Vitest with jsdom and a separate node config for storage tests.
- CI: GitHub Actions на Node `22.x` и npm.
- Не выполнено: preload/security hardening; renderer пока использует прямые Electron imports.

## Целевое состояние

- Node: `22.22.x` LTS или актуальный Node 22 LTS patch.
- npm: версия из Node 22 LTS, ветка `10.9.x`.
- Lockfile: `package-lock.json`.
- Electron: `42.x` или актуальная поддерживаемая стабильная ветка на момент выполнения.
- electron-builder: `26.x`.
- electron-updater: `6.8.x`.
- Vue: `3.5.x`.
- Vuetify: latest `3.x` на первом проходе; `4.x` отдельным решением.
- TypeScript: `5.x` на первом проходе; `6.x` отдельным решением.
- Unit tests: Vitest.
- CI: `npm ci`, Node `22.x`.

## Принципы миграции

- Один источник риска на один этап.
- Сначала фиксировать baseline, затем менять package manager.
- Не чинить последствия без поиска причины.
- Не смешивать Vite migration с Vuetify 4, TypeScript 6 и security hardening.
- Не удалять пользовательские изменения в рабочем дереве.
- Каждый этап должен иметь понятные команды проверки и критерии готовности.

## Этап 0. Baseline

Цель: понять, что работает и что уже сломано на текущем npm/Vite baseline.

Команды:

```bash
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run electron:build
```

Дополнительная проверка:

```bash
npm run electron:serve
```

Критерии готовности:

- Установка зависимостей воспроизводима.
- Lint либо зеленый, либо список текущих ошибок зафиксирован.
- Unit-тесты либо зеленые, либо список текущих падений зафиксирован.
- Production build либо зеленый, либо причина падения зафиксирована.
- Dev Electron app запускается или причина падения зафиксирована.

Камни:

- Если baseline красный, нельзя смешивать его исправление с очередной миграцией.
- Локальная macOS-сборка не заменяет Windows CI build.
- В рабочем дереве уже могут быть чужие изменения; их нельзя откатывать в рамках плана.

## Этап 1. Переход с Yarn на npm

Цель: сменить package manager без major-обновления зависимостей.

Статус: выполнено. Проект использует npm, `package-lock.json` и `npm ci` в CI.

Изменения:

- Удалить `yarn.lock`.
- Сгенерировать `package-lock.json` через `npm install`.
- Заменить `packageManager` на npm.
- Заменить Yarn-команды в документации и CI на npm.
- Перенести Yarn `resolutions` в npm `overrides`.

Текущий рискованный фрагмент:

```json
"resolutions": {
  "vue-cli-plugin-electron-builder/electron-builder": "^23.0.3"
}
```

Целевое действие:

- Проверить, нужен ли override после npm install.
- Если нужен, описать его через `overrides`.
- Не удалять override без проверки Electron builder dependency tree.

Команды проверки:

```bash
npm install
npm run lint
npm run typecheck
npm run test:unit
npm run electron:build
```

CI после перехода:

```bash
npm ci
npm run lint
npm run test:unit
npm run electron:build -- -p always
```

Критерии готовности:

- `package-lock.json` создан и закоммичен.
- `yarn.lock` удален.
- `npm ci` работает в чистой установке.
- Локальные команды работают не хуже baseline.
- CI использует npm cache.

Камни:

- npm может выбрать другие транзитивные версии даже без major-update.
- npm не понимает Yarn `resolutions`.
- `npm ci` падает, если `package-lock.json` не соответствует `package.json`.
- `postinstall` с `electron-builder install-app-deps` надо проверять на Windows.

## Этап 2. Node 16 -> Node 22

Цель: подготовить проект к свежему Electron, Vite и ESLint.

Статус: выполнено. `.nvmrc`, `package.json engines` и GitHub Actions используют Node 22.

Изменения:

- `.nvmrc`: `v22.22.x` или актуальный Node 22 LTS patch.
- `package.json engines`: `>=22.12.0 <23.0.0`.
- GitHub Actions: `node-version: 22.x`.
- Документация: заменить Node 16 на Node 22.

Команды проверки:

```bash
node -v
npm -v
npm ci
npm run lint
npm run test:unit
npm run electron:build
```

Критерии готовности:

- Локальная и CI-среда используют Node 22.
- npm install/ci воспроизводимы.
- Текущая сборка либо работает, либо зафиксировано, что Vue CLI блокирует Node 22.

Камни:

- Старые loaders и плагины Vue CLI могут не работать на Node 22.
- Если Vue CLI ломается на Node 22, не стоит долго лечить Vue CLI: это аргумент переходить к Vite.
- Native modules могут потребовать rebuild.

## Этап 3. Переход с Vue CLI на Vite/electron-vite

Цель: убрать устаревший build layer и сделать сборку контролируемой.

Статус: выполнено для main/renderer build. Используется `vite-plugin-electron`; preload entrypoint пока отсутствует и должен появиться в отдельном security-hardening этапе.

Рекомендуемый вариант:

- Использовать `electron-vite`, если он покрывает текущие требования.
- Если `electron-vite` блокирует нужные сценарии, использовать `vite-plugin-electron` плюс явный `electron-builder`.

Изменения:

- Заменить scripts `serve`, `build`, `electron:serve`, `electron:build`.
- Создать рабочий Vite/Electron config с актуальными путями.
- Перенести aliases:
  - `@frontend` -> `src/frontend`
  - `@electron` -> `src/electron`
  - `@common` -> `src/common`
  - `@` -> `src`
- Убрать импорт `createProtocol` из `vue-cli-plugin-electron-builder/lib`.
- Настроить dev URL для renderer.
- Настроить production loading для renderer.
- Сохранить `extraResources`, icons, NSIS и app metadata.

Особое внимание:

- `vite.config.ts` использует реальный main entry `src/electron/main.ts`.
- Aliases `@frontend`, `@electron`, `@common` и `@` настроены в Vite и Vitest configs.
- Dev loading использует `process.env.VITE_DEV_SERVER_URL`.

Команды проверки:

```bash
npm run electron:serve
npm run build
npm run electron:build
```

Критерии готовности:

- Dev Electron app запускается через Vite.
- Production build создает installer/artifacts.
- Renderer открывается в packaged app.
- Static assets доступны.
- Aliases работают в main, renderer и shared code.

Камни:

- Vue CLI скрывал часть Electron-настроек; после перехода их надо описать явно.
- `public/index.html` может требовать адаптации под Vite.
- Production file/protocol loading может сломаться только в packaged app.
- Source maps и devtools поведение изменятся.

## Этап 4. Electron packaging stack

Цель: обновить builder/updater/rebuild без одновременного UI update.

Статус: выполнено для `electron-builder@26.x` и `electron-updater@6.8.x`.

Пакеты:

- `electron-builder@26.x`.
- `electron-updater@6.8.x`.
- `@electron/rebuild@4.x`, если требуется для native deps.

Проверить builder options:

- `productName`.
- `appId`.
- `.linka` file association.
- `publish`.
- `win.icon`.
- `publisherName`.
- `signingHashAlgorithms`.
- `verifyUpdateCodeSignature`.
- `nsis.include`.
- `nsis.perMachine`.
- `extraResources`.

Команды проверки:

```bash
npm run electron:build
```

Критерии готовности:

- Windows artifact собирается в CI.
- Installer устанавливает приложение.
- App запускается после установки.
- Artifact names и publish metadata ожидаемые.

Камни:

- electron-builder может изменить структуру output и metadata.
- Windows signing может падать только в CI.
- `perMachine` install может требовать admin-поведения в smoke test.

## Этап 5. Electron 37 -> Electron 42

Цель: перейти на поддерживаемую ветку Electron.

Статус: выполнено. Проект использует Electron `42.x`.

Изменения:

- Обновить `electron` до `42.x` или актуального supported major.
- Выполнить native rebuild при необходимости.
- Проверить Electron breaking changes между 37 и целевой версией.

Команды проверки:

```bash
npm run electron:serve
npm run electron:build
```

Ручная проверка:

- Окно создается.
- Renderer загружается в dev и packaged app.
- IPC `app_version` работает.
- Updater events доходят до renderer.
- App корректно закрывается и перезапускается.
- Devtools открываются в dev mode.

Критерии готовности:

- Dev/prod app работают на Electron 42.
- Native deps не падают при запуске.
- Updater не ломает startup.

Камни:

- Electron поддерживает только последние три stable major.
- Security defaults могут измениться.
- Native modules могут не загрузиться без rebuild.
- Ошибки protocol/file loading часто проявляются только в packaged app.

## Этап 6. Preload и security hardening

Цель: убрать прямой доступ renderer к Node/Electron API.

Текущее состояние:

- `nodeIntegration` включается через plugin options/env.
- Renderer импортирует `ipcRenderer` из `electron`.
- Используется `Store.initRenderer()`.

Целевое состояние:

- `nodeIntegration: false`.
- `contextIsolation: true`.
- `preload.ts` экспортирует безопасный API через `contextBridge`.
- Renderer использует `window.linkaApi` или аналогичный typed API.
- Типы API описаны в `.d.ts`.

Критерии готовности:

- Renderer не импортирует `electron` напрямую.
- Все IPC-каналы централизованы.
- Unit-тесты могут мокать preload API.
- App работает с включенным `contextIsolation`.

Камни:

- Это может затронуть много файлов.
- Не стоит смешивать с Vite migration в одном PR, если можно избежать.
- `electron-store` в renderer может потребовать переноса доступа в main/preload.

## Этап 7. Vue 3.2 -> Vue 3.5

Цель: обновить Vue runtime без переписывания состояния и UI.

Статус: выполнено. Проект использует Vue `3.5.x`.

Пакеты:

- `vue@3.5.x`.
- `@vue/test-utils@2.4.x`.
- `vue-router` - сначала оставаться на актуальной совместимой ветке `4.x`, если major `5` не требуется.
- `vuex@4.1.0` можно оставить.

Не делать на этом этапе:

- Vuex -> Pinia.
- Полный rewrite components.
- Vuetify 4.

Команды проверки:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run electron:serve
npm run electron:build
```

Критерии готовности:

- Renderer стартует.
- Unit-тесты проходят или адаптированы.
- Основные views работают.

Камни:

- Типы Vue могут стать строже.
- Старые test utils setup могут сломаться после перехода с Vue CLI.
- Неиспользуемые `vue-class-component` и `vue-property-decorator` надо удалять только после проверки, что они реально нигде не используются.

## Этап 8. Vuetify

Цель: обновить UI framework без одновременной смены major UI API.

Статус: выполнено для Vuetify latest `3.x`. Vuetify `4.x` остается отдельным решением.

Порядок:

- Поднять Vuetify до latest `3.x`.
- Проверить theme API.
- Проверить основные views вручную.
- После стабилизации решить, нужен ли Vuetify `4.x`.

Проверить:

- Theme colors.
- Icons из `@mdi/font`.
- Dialogs.
- Buttons.
- Forms/settings.
- Layout responsive behavior.

Критерии готовности:

- Нет runtime warnings, влияющих на UI.
- Основные экраны визуально не деградировали.
- Цветовая тема сохраняется и применяется.

Камни:

- Vuetify 4 может потребовать массовых правок компонентов.
- Текущая тема зависит от Vuex state при создании Vuetify instance.
- Без visual regression tests нужна ручная матрица проверки.

## Этап 9. TypeScript

Цель: обновить TypeScript без лавины не связанных изменений.

Статус: выполнено для TypeScript `5.x`. TypeScript `6.x` остается отдельным решением.

Порядок:

- Поднять TypeScript до `5.x`.
- Проверить Vite/electron-vite type config.
- После стабилизации отдельно оценить TypeScript `6.x`.

Проверить `tsconfig.json`:

- `target`.
- `module`.
- `moduleResolution`.
- `paths`.
- `types`.
- `include`.

Проверено:

- Устаревший `tsconfig.node.json` удален, потому что текущие scripts не используют `electron-vite` и `@electron-toolkit/tsconfig`.
- `mocha` types удалены из `tsconfig.json`; unit-тесты используют Vitest globals и Chai assertions.

Критерии готовности:

- Type check проходит.
- `npm run typecheck` проходит.
- Vite build проходит.
- Electron main/preload типизируются.
- Unit-тесты видят нужные globals/types.

Камни:

- `moduleResolution` может потребовать `bundler`, `node16` или `nodenext`.
- Старые decorators/class fields могут давать отличия поведения.
- TS 6 не надо брать до зеленого TS 5.

## Этап 10. ESLint

Цель: обновить lint stack под Node 22, Vue 3.5 и TypeScript.

Пакеты:

- `eslint@9` или `eslint@10`.
- `eslint-plugin-vue@latest`.
- `@vue/eslint-config-typescript@latest`.
- `typescript-eslint@latest`.

Порядок:

- Сначала обновить конфиг до совместимого состояния.
- Потом отдельно чистить новые lint warnings/errors.

Критерии готовности:

- `npm run lint` работает.
- Стиль проекта сохранен: double quotes, semicolons, no trailing commas.
- Lint не требует массового unrelated rewrite.

Камни:

- ESLint 9/10 ориентируется на flat config.
- Старый `.eslintrc.js` может потребовать миграции.
- Одновременный auto-fix может создать большой шум в diff.

## Этап 11. Unit tests: Vue CLI/Mocha -> Vitest

Цель: убрать зависимость тестов от `vue-cli-service`.

Статус: выполнено. Unit-тесты запускаются через Vitest.

Изменения:

- Добавить `vitest`.
- Добавить `jsdom` или `happy-dom`.
- Настроить test aliases.
- Замокать Electron API.
- Перенести существующие tests из `src/frontend/tests/unit`.

Script:

```json
"test:unit": "vitest run && vitest run --config vitest.node.config.ts"
```

Критерии готовности:

- Все существующие unit-тесты перенесены.
- Тесты запускаются через npm.
- Electron-specific imports не ломают test environment.

Камни:

- Тесты могут зависеть от Webpack behavior.
- Vuetify components требуют setup при mount.
- IPC/electron-store надо мокать явно.

## Этап 12. CI и release workflows

Цель: все workflows отражают npm/Node 22 и новую сборку.

Статус: почти выполнено. Основные workflows используют Node 22, npm cache и `npm ci`; update smoke должен проверяться на Windows после изменений installer output.

Обновить:

- `.github/workflows/electron.yml`.
- `.github/workflows/update-smoke.yml`.
- Документацию по локальному запуску.

Проверить:

- `actions/checkout@v4`.
- `actions/setup-node@v4`.
- `node-version: 22.x`.
- `cache: npm`.
- `npm ci`.
- `npm run lint`.
- `npm run typecheck`.
- `npm run test:unit`.
- `npm run electron:build -- -p always`.

Критерии готовности:

- Windows CI build зеленый.
- Update smoke workflow зеленый или содержит понятную внешнюю причину падения.
- Release publish metadata не сломана.

Камни:

- `publish-linka-looks-updater.yml` выполняет `node update.js` на удаленном сервере. Надо отдельно знать Node version на сервере.
- `windows-latest` может менять окружение.
- npm cache не должен маскировать несовпадение lockfile.

## Этап 13. Installer и auto-update smoke

Цель: проверить реальное обновление, а не только build.

Сценарий:

- Собрать старую установленную версию.
- Собрать новую версию.
- Установить старую версию.
- Запустить app.
- Подложить update feed или использовать тестовый feed.
- Проверить download.
- Проверить restart/install.
- Проверить новую версию после запуска.

Проверить:

- `app.getVersion()`.
- `update_available`.
- `download-progress`.
- `update_downloaded`.
- `restart_app`.
- Логи `UPDATE_LOG_PATH`.

Критерии готовности:

- Update smoke проходит на Windows.
- Нет restart loop.
- Cooldown logic работает.
- User data не теряется.

Камни:

- Auto-update часто ломается не на build, а на metadata/signing/feed URL.
- Installer per-machine может требовать elevated permissions.
- Проверка на macOS не доказывает Windows updater.

## Этап 14. Ручная матрица проверки приложения

Минимальный smoke checklist:

- Dev app запускается.
- Packaged app запускается.
- Главный экран открывается.
- Навигация между основными views работает.
- Создание набора работает.
- Редактирование набора работает.
- Сохранение и повторное открытие набора работает.
- Открытие `.linka` файла работает.
- Настройки сохраняются после перезапуска.
- Цветовая тема применяется.
- TTS работает.
- Picture bank/API работает.
- Drag/drop работает.
- Keyboard activation работает.
- Mouse activation работает.
- Joystick activation работает, если есть устройство.
- Eye/Tobii integration работает или корректно деградирует без устройства.
- Auto-update flow работает.

## Рекомендуемые PR

1. `chore: capture baseline fixes`
2. `chore: migrate package manager to npm`
3. `chore: update runtime to node 22`
4. `build: migrate electron app from vue cli to vite`
5. `build: update electron packaging stack`
6. `chore: update electron to 42`
7. `chore: update vue dependencies`
8. `test: migrate unit tests to vitest`
9. `chore: update typescript and eslint`
10. `refactor: isolate electron api behind preload`
11. `chore: update vuetify 3`
12. `chore: evaluate vuetify 4 migration`

## Не делать сразу

- Не переходить сразу на Vuetify 4.
- Не переходить сразу на TypeScript 6.
- Не делать Vuex -> Pinia в рамках build migration.
- Не делать security hardening в том же PR, что и первая Vite migration, если это не обязательно.
- Не менять package manager и Electron major в одном PR.
- Не править весь lint auto-fix одним большим diff без необходимости.

## Первый практический шаг

Текущий практический порядок:

```bash
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

После зеленого baseline отдельно выполнять оставшиеся рискованные этапы: update smoke на Windows, затем preload/security hardening.
