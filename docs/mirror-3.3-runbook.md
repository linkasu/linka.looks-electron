# Зеркало 3.3: patch для review, НЕ выполненный production rollout

## Установленный источник и scope

29 октября 2026 штатным read-only SSH проверен **`linka.su`**, каталог
`/home/aacidov/linka-docker/wordpress/dist/linka.looks`.
`/home/aacidov/linka-docker` **не Git-репозиторий**; локального checkout
`/Volumes/data/linka/linka-docker` нет. Нельзя заявлять найденный upstream repo.
Точный исполняемый source — серверный `update.js` (1143 bytes), SHA256:
`86838a90dc189a2fd29eca9007e6d93d84b8e7643c9362b043bd023d9f0aeeb3`.
Он выбирает `releases/latest`, удаляет текущий EXE, скачивает прямо в его имя,
потом пишет `version.json`. Caller — workflow этого Electron-репозитория.

Версионируемый replacement находится здесь: `scripts/mirror/update.cjs`.
Изменённый workflow передаёт **проверенный checkout script через stdin SSH**, а не
запускает случайную серверную копию. Старый `update.js` остаётся нетронутым,
но новый caller его не вызывает. Никаких новых credentials, сервисов или прав.
Переход workflow в production допустим только после review и подготовки ниже.

Существующая схема: nginx root `/var/www/html`; compose монтирует
`./wordpress:/var/www/html:ro`. В прочитанных nginx configs нет
`disable_symlinks`/`open_file_cache`; обычная static-раздача с `try_files`.
HTTP-проверка будущих aliases на реальном nginx ещё НЕ проведена.
Повторное read-only чтение подтвердило Node **v24.5.0**, filesystem type из
`stat -f -c %T` — **ext2/ext3**; SHA source и `version.json` остались значениями
аудита. Существующий Node поддерживает используемые native API; реальный
production fsync/symlink switch не запускался ради этой проверки.

## Инварианты и атомарность

```text
releases/3.2.13-<old-sha>/   installer + version.json + manifest.json (сохранены)
releases/3.3.0-<new-sha>/    installer + version.json + manifest.json (immutable)
current -> releases/<version>-<sha>     # один atomic rename symlink на POSIX
linka.looks.setup.exe -> current/linka.looks.setup.exe
version.json         -> current/version.json
manifest.json        -> current/manifest.json
```

- Не удаляются старые versioned installers, `old.exe`, `back`, ZIP/другие данные.
- `prepare` сначала копирует и проверяет текущий EXE, fsync файлов/каталогов;
  затем ставит aliases, пока все они ещё ведут на **ту же старую версию**.
  Interrupted bootstrap можно проверить и продолжить только после осмотра lock.
- Update требует уже подготовленные aliases, проверяет текущую пару, берёт
  **tag `vVERSION`**, единственный точный x64 asset, size, published digest
  (когда есть) и обязательный отдельно переданный SHA256. Draft/prerelease запрещены.
- Workflow получает metadata через свой существующий `github.token` и передаёт
  только tag/state/asset JSON в `MIRROR_RELEASE_B64`; токен на сервер не передаётся.
  Та же валидация выполняется повторно. Это устраняет наблюдавшийся HTTP403
  unauthenticated GitHub API без новых серверных credentials. Ручной CLI без
  metadata по-прежнему использует API и при HTTP403 безопасно останавливается.
- Download идёт в отдельный temp; HTTP/stream/hash/version failure не переключает
  `current`. Новая immutable generation проверяется и синхронизируется до switch.
  Обновление/rollback сериализованы `.mirror-update.lock` и CI concurrency.
- Manifest содержит version/hash/size/immutable installer path/previous target.
  Два HTTP-запроса по legacy URLs могут пересечь момент switch; клиенту,
  которому нужна точная пара, надо читать manifest и его **versioned installer**.
- SIGKILL до switch сохраняет старую generation; stale lock **не снимается
  автоматически**. После rename, если финальный fsync вернул ошибку, outcome
  может быть новым: сначала проверить `readlink current` и manifest, НЕ replay.
  Полная power-loss/файловая система production не эмулировалась.

## До production: локальные тесты / dry-run

```sh
node --test scripts/mirror/update.test.cjs
```

Тесты работают только с созданными временными каталогами: HTTP failure,
interrupted stream и SIGKILL процесса во время download, hash/size/version/draft
failure, immutable storage conflict и concurrent writer. Проверяют старые bytes,
manifest, version и historical installer; успешный switch и точный rollback.
Dry-run действительно скачивает/проверяет bytes, не меняет mirror root.

## Только после review: подготовка (НЕ запускалась)

Координатор исключает запуск старого workflow/ручного updater; новые и старые
скрипты не имеют общего lock. Не менять security/permissions и не удалять данные.
Повторно проверить source SHA и пару; при отличии от значений ниже остановиться.
Проверить Node >=18 и POSIX filesystem/fsync/symlinks на целевом сервере.
Сохранить отдельную копию server script вне public root; передать reviewed
replacement в согласованное непубличное место (например, operator staging).

Из согласованного staging, не публикуя никаких релизов:

```sh
ROOT=/home/aacidov/linka-docker/wordpress/dist/linka.looks
OLD_SHA=4c5ada9fba8df88f0030b1c1fd52fe4f9851275eabcf64e21a1f4eecb1fef764
node update.cjs prepare "$ROOT" 3.2.13 "$OLD_SHA"
```

Исходный EXE: **134378829 bytes**, `version.json={"version":"3.2.13"}`,
version SHA256 `65eab653fb6d0d061a67fa025a1a6e34d569fce7ee31a47493c99553143d6caf`.
Bootstrap не обновляет приложение, но меняет aliases — требует отдельного review.
Проверить HTTP legacy URLs, immutable URL и manifest; bytes/version должны остаться
старыми. Hash всех старых installers до/после должен совпасть.

Для уже опубликованного reviewed release с известным digest (не создавать release
ради dry-run):

```sh
node update.cjs update "$ROOT" 3.3.0 "$REVIEWED_330_SHA256" --dry-run
```

Сейчас `3.3.0` не опубликована, поэтому реальный pinned-3.3.0 download dry-run
не заявляется. На локальной копии production-пары можно сначала проверить
опубликованную 3.2.13 с её независимо проверенным digest; production не менять.
Read-only download 3.2.13 через существующий `gh` уже подтвердил исходные
134378829 bytes и SHA256 выше. Локальный dry-run через gh transport прошёл;
первый unauthenticated API-вариант получил HTTP403 и ничего не переключил.
Затем прошёл и **тот же CLI через stdin с обычным native binary fetch**:
metadata получена через существующий gh и передана в `MIRROR_RELEASE_B64`;
токен не передавался. `dryRun=true`, size/hash проверены, current не изменён.

## Только после допуска выпуска: update и rollback

Штатный publisher workflow получает digest точного published tag, вызывает
reviewed script; если digest отсутствует или aliases не готовы, **останавливается**.
После switch проверить `readlink current`, manifest, публичный immutable download
hash/size, version и legacy URL. Не запускать параллельно ручной update.

Конкретный rollback зеркала:

```sh
node update.cjs rollback "$ROOT" 3.2.13 \
  4c5ada9fba8df88f0030b1c1fd52fe4f9851275eabcf64e21a1f4eecb1fef764
```

Он проверяет сохранённую старую generation и атомарно возвращает один pointer,
сохраняя новую generation. При stale lock сначала доказать, что updater-процесс
завершён, осмотреть current/generations, затем отдельно согласовать снятие только
пустого lock через `rmdir` — не обходить живого writer и не повторять uncertain update.

Rollback зеркала **не откатывает GitHub electron-updater feed и установленные
копии**. Release/feed/удаление assets и downgrade требуют отдельного решения.
До установки сохранять пользовательские `.linka` и userData. Реальный server
rollout/HTTP switch/rollback и NSIS downgrade в этой задаче не выполнялись.
