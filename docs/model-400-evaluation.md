# M03 — независимый контракт оценки предиктора

Статус: **протокол до настройки; качество НЕ оценено**. Это синтетический
русскоязычный набор обычных коммуникативных намерений, не записи пользователей,
не клиническое исследование AAC и не оценка эффективности управления взглядом.
FINAL не служит источником обучения, разработки признаков, словаря или отбора модели.

## Роли, происхождение, изоляция

- Источник только `FIRST_PARTY_PROJECT_AUTHORED_SYNTHETIC`: новый текст, специально
  сочинённый независимым AI-куратором проекта. Не человеческая выборка AAC.
  Разрешение владельца на CC0 для новых синтетических данных передано в задании.
  Лицензия данных: **CC0-1.0**, <https://creativecommons.org/publicdomain/zero/1.0/>.
  Она не меняет лицензии исходников приложения или предиктора.
- Никаких личных сообщений, имён, адресов, медицинских/детских данных, выгрузок
  пользователей или заимствованных предложений. Куратор не открывает старые модели,
  raw train, прежние зарезервированные предложения и результаты предсказаний.
- Прежний reserved уже exposed. Tatoeba — contaminated comparator; Wikipedia —
  proxy. Ни один из них, даже переименованный, не может стать FINAL. Другие
  неизвестные источники тоже запрещены. Они не входят в этот артефакт.
- Training-агентам **запрещено читать FINAL**, включая authoring-файл, строки JSONL,
  результаты по предложениям и дампы запросов. Primary ревьюит протокол, схемы,
  счётчики и хеши, не предложения. Куратор не принимает решения о качестве модели.
- Данные находятся только в игнорируемом
  `release-evidence/400/frozen-evaluation/`. Не переносить в predictor worktree,
  train/dev corpus, fixtures, CI, git, issue, PR или отчёты. DEV — отдельный JSONL,
  разрешённый для разработки только после проверки split.
- Игнорирование git и локальные права — защита от случайной утечки, не sandbox.
  FINAL запускает независимый оценщик в отдельном процессе без права настройки.
  Внешняя публикация и выдача доступа требуют разрешения владельца.

## Фиксация до обучения/настройки

Локальные файлы: `FINAL.jsonl`, `DEV.jsonl`, `manifest.json`,
`manifest.sha256`, `ACCESS.md`, `LICENSE-DATA.txt`. Authoring-файл после упаковки
удаляется куратором, чтобы не оставлять вторую копию FINAL.

Manifest `linka-evaluation-seal-v1` содержит UTC-время, split, источник, лицензию,
`synthetic:true`, `clinicalAAC:false`, `proxy:false`, `minGroups:500`, число строк,
число семантических групп, домены/страты, SHA-256 точных байтов FINAL и DEV,
SHA-256 протокола, адаптера и проверяемых исходников UI. Отдельный checksum
фиксирует байты manifest. Primary сохраняет checksum до начала настройки.
Seal содержания не означает ни quality PASS, ни доказанную независимость train.

Порядок допуска:

1. Сначала зафиксировать FINAL и DEV; training owner подтверждает, что эта фиксация
   предшествует началу новой настройки/обучения. Параллельный неизвестный статус
   обучения — **непроверенная предпосылка**, не ложная аттестация куратора.
2. До доступа оценщика к FINAL владелец утверждает группировку и достаточность
   покрытия, независимый аудитор проверяет межсплитовые/межкорпусные утечки.
   Аудитор может сравнить хеши нормализованных строк и семантические совпадения
   локально; training owner получает только заключение, не FINAL и не совпавшие
   предложения. Куратор не открывает train. Синтетический источник сам по себе
   не гарантирует, что обычная фраза нигде не встречалась.
3. Все параметры выбрать только на DEV. До FINAL записать immutable run-freeze:
   хеш модели-кандидата, частотного baseline, core/evaluator commit, бинарников,
   этой версии протокола, UI-фильтра, DEV, словаря, параметров, cost policy,
   bootstrap seed/число реплик, платформы и версии Node. Один кандидат, без
   model selection на FINAL. Отсутствие любого обязательного поля блокирует запуск.
4. Независимый оценщик сверяет seal и run-freeze, выполняет один оценочный запуск.
   Сохраняет закрытый журнал доступа и подробные результаты; наружу — только
   агрегаты, хеши и причины блокировки. По FINAL ничего не перенастраивают.
   Инфраструктурный повтор допустим лишь с теми же байтами/параметрами и отдельным
   обоснованием; плохой результат не является инфраструктурной ошибкой.
5. После раскрытия результата FINAL помечается EXPOSED для будущего обучения:
   повторная настройка требует нового независимого FINAL и новой регистрации.

## Строки и независимость групп

UTF-8 без BOM, NFC, JSONL с конечным LF. Одна строка:

```json
{
  "group": "fixture-001",
  "intent": "fixture-intent",
  "domain": "fixture",
  "text": "только тестовая строка",
  "source": "FIRST_PARTY_PROJECT_AUTHORED_SYNTHETIC"
}
```

Пример — только публичная fixture, не FINAL. `group` — единица ресемплинга;
`intent` — стабильная кураторская метка, а не новый независимый пример.
Одно коммуникативное намерение и его перефразировки имеют общий group. Смена
падежа, местоимения, порядка слов, синонима, ё/е или пунктуации не создаёт группу.
Разные бытовые цели могут относиться к одному домену, но не размножаются заменой
слотов в шаблоне. Число строк и число групп публикуются отдельно.

Куратор сочиняет каждую исходную цель отдельно в тематических блоках, затем
сверяет цели между блоками и присоединяет близкие перефразировки к той же группе.
Это ручная семантическая группировка AI-куратора, **не доказательство статистической
независимости** и не независимая человеческая экспертиза. Проверка строк ловит
точные/нормализованные повторы, но не доказывает различие смыслов. Если аудит
сливает группы и остаётся меньше 500, статус BLOCKED, а не фиктивные новые ID.

Страты фиксируются без ответов модели: длина сообщения (1–3, 4–8, 9+ слов),
наличие ё, явное отрицание, домен. Морфологическое покрытие — естественные
падежи, числа и формы глаголов в авторском тексте, без утверждения о балансировке
морфологическим анализатором. Набор в нижнем регистре; обобщения на произвольный
регистр, диалекты и реальные распределения частот не заявляются.

Короткие и длинные префиксы задаёт траектория ввода, а не подбор лёгких слов.
На всех словах буквенная длина префикса репортируется как 1, 2, 3, 4+ символов;
пустой префикс/пробел не даёт selectable completion в нынешнем приложении.
Пунктуацию и ё при проверке результата не удалять и не уравнивать с е.

## Адаптер приложения — без inference

`scripts/ci/predictor-evaluation.mjs` принимает готовые `Input` и `Prediction`,
а не executable/model paths. Запускать модель ему нечем: вместо Predictor
подставлен ответ вызывающего оценщика. Исходники TypeScript транспилируются
уже установленным dev TypeScript без изменения исходников.

Адаптер использует **настоящие** `applySuggestion`, `TypingSession` и `EyeTyping`:

- core выдаёт максимум 5; исходный ранжированный порядок не менять;
- exact text/caret/language, UTF-16 границы, stale и malformed — ошибка, не miss;
- `TypingSession` отбрасывает изменения контекста, небуквенные/не-RU варианты;
  после фильтра остаётся максимум 3 слова. Нельзя сначала обрезать raw до трёх;
- prefix определяется по тексту слева от caret; пробел добавляется только в
  конце текста; существующий суффикс сохраняется, существующий пробел может
  быть пройден caret; внешние пробелы/контекст не нормализуются;
- main caret — UTF-16, draft caret — Unicode code points; изменение текста создаёт
  ровно одну запись истории, один Undo точно восстанавливает исходный draft;
  если текст тот же, движение caret допустимо, история неизменна и Undo не
  вызывается: иначе он отменил бы несвязанное предыдущее редактирование;
- реальные app unit-тесты остаются источником контракта. Проверки адаптера
  используют только публичные искусственные fixtures, не зарезервированные строки.

Это соответствует существующему тесту `EyeTyping.spec.ts`: переход через пробел
после уже завершённого слова — навигация без лишней записи Undo, не баг приложения.
Ранний seal ошибочно требовал восстановления caret и для такого случая; он заменён
новым предобучающим seal с сохранением superseded receipt. App-код не меняется.
Сами исключения адаптера могут содержать diff текста:
оценщик хранит их закрыто и публикует только обезличенные коды, не error.message.

Ссылки: `vendor/predictor/docs/electron-api.md` (snapshot из PROVENANCE),
`src/electron/services/typingSession.ts`, `src/frontend/utils/eyeTyping.ts`,
`src/electron/tests/unit/typingSession.spec.ts`.

## Замороженная метрика и сценарии

**Каноническая FINAL метрика — `UI_KSR_V1`**, описанная ниже: отношение сумм
group-усреднённых cost counts, seed 40003. Primary подтвердил этот выбор до любого
реального обучения и открытия FINAL моделью. Пороги и исходный estimand сохранены.
`spec/evaluation.md` и `crates/predictor-cli/src/evaluate.rs` в source core используют
другую метрику — `core_DEV_phrase_mean` с seed 906. Она остаётся только для
внутреннего DEV/диагностики, не эквивалентна UI_KSR_V1, не участвует в FINAL решении.
Запрещено смешивать числа/интервалы или выбирать удачный агрегатор после FINAL.

Reuse core в FINAL — настоящий `Predictor::load`/`complete`, сериализованные raw
ответы и затем реальные app-фильтры/редактирование. Узкий app harness
`predictor-evaluation-ui.mjs` реализует только этот фиксированный UI cost/bootstrap,
не переписывает core evaluator и не является общей ML/metrics библиотекой.

Основной сценарий — последовательное написание каждого сообщения с пустого draft,
цель `text + " "`. Ручное действие печатает один Unicode code point, включая
пробел/пунктуацию. На каждом шаге оценщик получает raw ответ, пропускает через
адаптер. Selectable edit можно принять за одно действие, только если его draft
является точным более длинным префиксом цели с caret на конце и экономит действия.
Из трёх видимых вариантов берётся тот, что даёт большее немедленное продвижение,
при равенстве — первый; иначе печатается следующий символ вручную. Это заранее
фиксированный oracle simulation, а не утверждение о поведении пользователя.
Никакой бесплатной коррекции: неверные варианты не принимаются.

В composition `Input.text` — **только уже введённый prefix**, caret на его конце.
Целевой текст нужен oracle только для проверки точного draft и стоимости, не
передаётся модели. Передача всего target с caret в середине здесь запрещена.
Правый суффикс существует лишь в отдельном editing/safety cohort, а model q и там
ограничен `input.text.slice(0,caret)`. App-пробел не удаляется бесплатно: если после
слова в target идёт `!`, `?`, запятая и т.п., draft с лишним пробелом не является
точным prefix, значит этот вариант **не выбирается**, остаток вводится вручную.
Этот консервативный oracle не добавляет repair-граф: выбранных неверных edits нет,
поэтому нет скрытых бесплатных deletion/insertion. Lowercase draft не совпадает с
uppercase target; никакой придуманной нормализации/восстановления регистра нет.
Для таких несовпадений действует тот же платный manual fallback. Это утверждение
о code-point action simulation, не реальных физических переключениях регистра.

`KSR = 1 - actions_with_suggestions / manual_actions`, где manual_actions — число
code points цели. Для группы сначала усреднить baseline/action counts её
перефразировок; итоговый KSR — отношение сумм этих group counts. Так одинаковая
цель не получает больший вес из-за числа перефразировок. Дополнительно публиковать
число слов/запросов, coverage, top-1/top-3 exact completion и действия по стратам;
core-only top-5 — лишь диагностика, не app quality. Dwell, перемещение взгляда,
просмотр меню, смена регистра/экранов и реальное время **не смоделированы**.

Суффикс/редактирование — отдельный safety cohort, без подмешивания к основному KSR.
Для каждого слова длины L >= 3 и k от 1 до L-2 удалить внутренний отрезок
`[k, m)`, где `m = ceil((k + L) / 2)`, оставить контекст и хвост слова/сообщения,
caret поставить после первых k букв. Ручной baseline — допечатать удалённый отрезок.
Успех — точный target с caret после восстановленного отрезка (существующий пробел
можно пройти по app policy), без изменения хвоста; иначе manual fallback.
Также проверить позицию перед следующим словом, пунктуационный хвост и no-prefix.
Каждое появление принадлежит исходной группе, не считается независимым наблюдением.
Канонически разложенное ё, emoji в контексте и adversarial stale/ABA/Undo покрываются
публичными UI fixtures: FINAL NFC-only, без утверждения о клинической валидации.

## Априорное решение о качестве

До FINAL фиксированы два сравнения: кандидат против ручного ввода и против
замороженного частотного baseline, оба через тот же UI и cost policy.
Парный bootstrap: 10 000 реплик, seed `40003`, percentile two-sided 95% CI
(2.5/97.5 процентили), пересчёт отношения сумм counts в каждой реплике.
Ресемплировать целиком семантические группы со всеми вариантами/сценариями;
если source exclusion audit обнаруживает зависимости между группами, использовать целые
компоненты, публиковать их число и повторно проверить >=500 независимых единиц.
Нельзя bootstrap-ить слова/префиксы как независимые примеры.
RNG UI_KSR_V1: `xorshift32-u32-modulo-v1`, начальное unsigned state 40003;
каждый draw: `s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0`, индекс
`s % numberOfComponents`. Ключи групп/компонент сортируются ASCII-лексикографически.
Суммы group counts сохраняются целиком внутри компоненты; компоненты выбираются
с возвращением. В каждой реплике заново считаются `1-C/M` и `(F-C)/M`, а не среднее
уже посчитанных KSR. После сортировки 10000 значений endpoint — элемент
`floor((10000-1)*p)` при p=0.025/0.975, без интерполяции. Версия и hash app harness
фиксируются seal и run-freeze; core seed906 здесь не используется.

- Общий кандидат: нижняя граница CI(KSR) **> 0** и нижняя граница
  CI(KSR(candidate) − KSR(frequency)) **>= 0**.
- Контекстный кандидат допускается вместо частотного **только** при нижней границе
  CI(KSR(contextual) − KSR(frequency)) **> 0**, а не по одной точечной оценке.
- При провале safety-инварианта, seal, независимости, размера или run-freeze —
  BLOCKED независимо от KSR. В остальных случаях невыполнение правил — NOT QUALIFIED.
  Отсутствие выигрыша не разрешает скрыто переключить кандидата после FINAL.
- Основной итог относится ко всему зафиксированному набору. Страты — описательные,
  не повод выбирать выгодную подвыборку или менять порог. Эти nominal 95% интервалы
  не являются simultaneous family-wise гарантией для множества страт.

Без реального inference на точных артефактах и проверки UI_KSR_V1 интервалов нет quality PASS.

## Локальные проверки

Node 22.22.2, без запуска модели, сети, CI или обучения:

```sh
node --test scripts/ci/predictor-evaluation.test.mjs
node scripts/ci/predictor-evaluation.mjs \
  release-evidence/400/frozen-evaluation/FINAL.jsonl \
  release-evidence/400/frozen-evaluation/manifest.json
```

Вторая команда разрешена только куратору/оценщику: она читает закрытый FINAL,
но печатает лишь статистику. Перед ней проверить `manifest.sha256` против
сохранённого primary хеша. Ни обучающий агент, ни CI эту команду не выполняют.
Selfchecks проверяют UTF-8/NFC, дубликаты, групповые ID, minGroups, запрещённые
источники/proxy seal, изменение хеша, реальные фильтры, suffix/caret/Undo и ошибки
ответов. Они не способны доказать семантическую независимость или отсутствие PII
за пределами ручной кураторской проверки.

## Evaluation-only workflow и private transport

Разрешённый новый файл source worktree:
`crates/predictor-cli/examples/model_final_stream.rs`. Это private JSONL transport,
не новый production worker. Два аргумента — immutable model path и JSON полного
`SearchConfig`; параметры выбираются на DEV и хешируются в run-freeze, не задаются
ответами FINAL. `Predictor::load` вызывается один раз, затем `complete` с
`lang:"ru", limit:5` без PersonalModel. Вход каждой строки:
`{id,q,lang,limit}`, где q — точный текст слева от UTF-16 caret. ID строго растёт,
максимум JS safe integer; q <=16384 UTF-8 bytes, строка <=128KiB, ответ <=256KiB,
лимит миллион запросов. Выход `{id,text,pos,endOfWord}` дополняется исходным Input
только внутри app harness, затем проходит `evaluateCandidateOutput`.

stdout stream содержит закрытые candidate strings: только pipe в app harness,
никогда terminal/workflow logs, upload-artifact или GITHUB_STEP_SUMMARY. Ошибки
stream обезличены. Nonzero exit аннулирует весь запуск, даже если часть ответов
уже получена. Локальные тесты stream используют только fixtures и callback double,
модель не загружают. Source файл не записывает данные и не обучает модель.

Отдельный `.github/workflows/model-final.yml` подготовлен в source worktree.
Он должен появиться на default source branch **до dispatch**, не включается в
production/train pipeline, имеет только `contents:read`/`actions:read` и manual
workflow_dispatch на default branch. Exact refs и запуск ещё требуют primary review.
Никаких publish, train, model selection или production approval в нём нет.

Десять обязательных входов evaluation-only workflow:

- `mode:dev|final` — ручной выбор фиксированной стадии, default dev;
- `source_sha`, `app_tooling_sha`: exact SHA, checkout без write credentials;
- `candidate_run_id`, `candidate_artifact_id`: успешный run из **того же** predictor repository,
  run conclusion/source SHA проверить через Actions API (`actions:read`);
- `candidate_model_sha256`: выбранная на DEV модель; frequency baseline, их SearchConfig,
  binary/evaluator SHA и однозначные пути файлов внутри проверенного artifact;
- `run_freeze_sha256`, `final_seal_sha256`, `protocol_sha256`: утверждённые pins;
  run-freeze также содержит DEV/exclusions
  hashes и согласованной metric policy; кандидат ещё не production-approved;
- `sealed_bundle`: opaque gzip-base64 <=65000 ASCII bytes, <=2MiB после bounded decompression;
  только fixed payload keys (final/dev JSONL, manifest и run-freeze), без tar/paths,
  с внешне pinned SHA каждого документа и metadata до любого inference;
- source/helper/tooling provenance и доступ независимого оценщика обязательны;
  для всей GitHub dispatch JSON также действует собственный лимит API.

Private inputs читаются из `GITHUB_EVENT_PATH`, **не из interpolated shell или step
env**, которые GitHub печатает. SDK step маскирует opaque bundle, проверяет run
status/conclusion/event/source SHA, путь model-candidates workflow, связь immutable
artifact с run, срок годности, размер <=300MiB и artifact SHA-256. GitHub хранит
dispatch event на своей стороне: это разрешённый evaluation transport, не шифрование
и не обещание скрыть данные от GitHub/операторов репозитория.

`predictor-evaluation-runner.mjs preflight` проверяет все hashes, frozen metadata,
исходники UI, source stream/helper, tracked hash-only exclusions, точные модели и
provenance. ZIP не исполняется: только выбранные root model files, provenance.json
и frequencies.tsv, source-manifest.json, receipt/DEV JSON выбранных моделей;
дубликаты путей, symlinks, traversal, oversized entries запрещены.
Иные corpus/group-map/attribution файлы не извлекаются и не читаются.
Модели ограничены 128MiB каждая, остальные извлекаемые файлы — 64MiB.

Канонический artifact contract — `U.lpk` (обязательный count baseline) и `T.lpk`
(опциональный contextual candidate), без aliases unigram/mkn3. Freeze допускает
`candidate_model_file:U.lpk|T.lpk`, `frequency_model_file:U.lpk`. Для U и выбранного
T обязательны соответствующие `U/T.receipt.json` со **state COMPLETED**, code=0,
child_reaped=true и точными model_sha256/bytes; receipt и `U/T.dev.json` должны
совпадать с provenance.files_sha256. Если выбран U, отсутствие/FAILED T допускается:
никакого автоматического выбора U после провала выбранного T на FINAL нет.
DEV JSON проверяется только хешем, его core_DEV метрики не используются в FINAL.
Provenance обязателен `schema:linka-model-candidates-v1`, source_revision,
source_manifest_sha256, **exclusions_sha256** (plural), files_sha256; quality_approved,
redistribution_approved, final_evaluated — false. source-manifest.json проверяется
по тому же внешне зафиксированному source_manifest_sha256. Старый singular key не
служит fallback и старые filenames не принимаются.

После preflight собирается release raw stream. Его Linux binary SHA-256 должен
быть получен owner из reviewed build **до** run-freeze и совпасть перед inference;
не подставлять hash, впервые увиденный вместе с FINAL результатом. Runner запускает
один U child или два owned child для T/U (каждый load один раз), one-in-flight
JSONL с deadline 10s/запрос; child stderr игнорируется, stdout только private pipe.
Nonzero exit, malformed/oversized/unsolicited output, неверный ID, частичный ответ
или ошибка safety аннулируют весь запуск, не превращаются в misses.

До DEV-plan и FINAL freeze owner получает из отдельного source CI job на
ubuntu-24.04 test-only artifact `eval-transport-<exact_source_sha>`: binary SHA-256
и receipt с source SHA, runtime-only mode, toolchain Rust 1.98.1 и build flags.
Этот job собирает только `model_final_stream`, без моделей/данных, не запускает
inference и не является production approval. Source CI добавляет primary.
Owner проверяет receipt/source SHA до открытия targets и вписывает полученный
SHA в существующее обязательное `stream_binary_sha256`; новых payload fields нет.

Source CI и EVAL используют один build на ubuntu-24.04, из source PWD:

```sh
RUSTFLAGS="--remap-path-prefix=$PWD=/linka/predictor" CARGO_INCREMENTAL=0 \
  cargo +1.98.1 build --locked --no-default-features --release -p predictor-cli --example model_final_stream
```

EVAL сравнивает свой binary с заранее pinned SHA до любого реального inference.
Несовпадение блокирует run; нельзя записать текущий hash как ожидаемый после
открытия targets или ослабить проверку. Tooling/prepare/trainer не включаются.
Curator hash helper отдельно собирается с `--no-default-features
--features tooling --example make_eval_exclusions`. Это учитывает интеграцию source
runtime/tooling features, не меняет private тексты и не переписывает Cargo/core.

`run` выполняет append simulation и отдельные suffix/prefix/no-prefix probes.
Для каждого слова и k=1..L отдельный prefix probe сохраняет всё после слова;
goal равен исходному сообщению, плюс пробел только когда хвоста нет. Caret учитывает
существующий первый пробел по app policy. Middle probes используют ранее описанное
удаление [k,m). No-prefix probe стоит перед каждым словом и требует пустой app menu.
Успешные exact edits — диагностическая accuracy; отсутствие правильного completion
допускает manual fallback, а не объявляется нарушением сохранности текста.

Публикуется только `linka-final-aggregate-v1`: hashes, status, bootstrap endpoints,
group-count KSR, размеры и счётчики. Top1/top3/coverage denominator — `eligible`
(посещённые sequential simulator состояния с буквенным prefix), не все теоретические
слова. Prefix bins `1/2/3/4` означают 1/2/3/4+ символов. Safety exact denominator —
prefix+middle probes, no-prefix учитываются отдельно. Домен/длина/ё/отрицание имеют
только descriptive row-pooled counts без CI/quality-решений; paraphrase rows там
видны явно. Primary quality всегда использует group-average counts и components.
Тексты, group IDs, per-row outputs, q и candidate strings в report не попадают.

`QUALIFIED_SIMULATION_ONLY` не означает production/clinical approval. NOT_QUALIFIED
сохраняет aggregate и завершает job nonzero; BLOCKED печатает лишь стабильный код.
Upload-artifact whitelist — только aggregate JSON, никогда temp directories. Private
model/config/transport files удаляются. Ошибка не даёт права на настройку по FINAL.

FINAL bundle schema `linka-final-bundle-v1` имеет **ровно** шесть полей:
`schema`, `final_jsonl`, `dev_jsonl`, `manifest_json`, `run_freeze_json`, `dev_report_json`.
Последние пять — точные UTF-8 строки файлов, не objects/path names; manifest и
run-freeze проверяются по внешним pins, данные — по manifest hashes. Bundle encoder
запускается только куратором после отдельного разрешения; здесь bundle не создавался.

Run-freeze schema `linka-final-run-freeze-v1`, `state:DEV_FROZEN_FINAL_UNOPENED`,
`metric:UI_KSR_V1` имеет строгую whitelist в `validateFreeze`, включая обязательный
`ui_dev_report_sha256`. DEV-report обязан предшествовать этому freeze. Обязательны source/app
SHA; executing workflow, stream source/Linux binary, exclusions helper/index и
source_manifest_sha256 hashes;
candidate run/artifact ID и ZIP/model hashes; frequency model/frequencies hashes;
полные candidate/frequency SearchConfig; manifest/protocol/DEV pins; exact Node и
TypeScript версии; `comparison:general|contextual`; mapping всех FINAL group IDs в
заранее одобренные component IDs (>=500); UTC timestamp и четыре подтверждения
`owner_approved`, `independence_approved`, `pretraining_chronology_attested`,
`dev_only_selection`, все true. Cost=1, resamples=10000, seed=40003 не настраиваются.
Seal timestamp обязан предшествовать candidate run.created_at; freeze следует после
успешного candidate run.updated_at и до FINAL inference. Это проверяемая хронология,
а утверждения о независимом review/blinding остаются ответственностью owner.

### Две фиксированные стадии: canonical UI_DEV до FINAL

`core_DEV_phrase_mean/906` не заменяет UI_DEV и не может выбрать FINAL модель.
Обе стадии используют один runner, один raw transport, настоящий app adapter и
один `UI_KSR_V1` cost/bootstrap. Все workflow runs сериализованы одной concurrency
group, cancel-in-progress=false; автоматического перехода, resume и продолжения
частичных результатов нет. `preflight` — только внутренний no-inference check той
же стадии, а не третий workflow mode.

| mode  | Допустимый текст в event                                   | Предусловие                                                                                                                                  | Итог                                                                                        |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| dev   | Только private DEV, ровно 30 строк; manifest/seal metadata | Успешный immutable candidate bundle, фиксированный DEV-plan/config/refs/hashes, U COMPLETED; T сравнивается только если COMPLETED и <=128MiB | Агрегат UI_KSR_V1 U/T, paired CI и рекомендация; никаких FINAL targets/решения о production |
| final | Sealed FINAL и DEV, metadata, агрегат завершённого UI_DEV  | Owner-precommitted FINAL run-freeze с выбранной моделью и hash DEV-report; >=500 FINAL компонентов                                           | Только проверка frozen кандидата, не выбор между U/T                                        |

DEV bundle `linka-ui-dev-bundle-v1` содержит **ровно** `schema`, `dev_jsonl`,
`manifest_json`, `run_freeze_json`. Поля `final_jsonl` нет даже пустого; FINAL bundle
в DEV отвергается. DEV encoder/куратор читает только DEV и metadata, **не открывает
FINAL** для формирования event. DEV artifact — только `dev-aggregate.json` без
строк DEV/FINAL, group IDs, запросов или candidate strings. Hash-only exclusions
могут проверяться в DEV целиком, включая cross-split связи, но FINAL текста там нет.

DEV-plan использует общий schema whitelist refs/hashes/config/cost, но имеет
`schema:linka-ui-dev-plan-v1`, `state:DEV_PARAMETERS_FIXED_FINAL_UNOPENED`, без
`ui_dev_report_sha256` и с component mapping только DEV. Поле `run_freeze_sha256`
в workflow в этом mode означает hash этого плана, не готовый выбор модели.
`candidate_model_file` означает **набор сравнения**, не рекомендацию: T при наличии
eligible COMPLETED T; иначе U, с config/hash идентичными frequency U. Optional FAILED,
отсутствующий или не помещающийся T не мешает U; RUNNING/CANCELLED/UNRECONCILED не
выдаются за завершённый результат. На DEV нет порога 500 компонентов: честно
публикуются фактические 30 групп/компоненты и ограничение маленькой выборки.

`linka-ui-dev-aggregate-v1`, status `DIAGNOSTIC_SELECTION_ONLY`, содержит UI cost
counts и KSR/95% CI U, а при eligible T — также T и парный CI(T−U), seed40003.
Правило рекомендации: **U по умолчанию**, T только если нижняя граница paired 95%
CI строго >0 и модель помещается в 128MiB. Core mean906 и U/T.dev.json не участвуют.
30 синтетических сообщений — diagnostic selection, не широкое AAC доказательство;
uncertainty оставляет U. Неверный/частичный inference блокирует run, не маскируется
под отсутствие выигрыша. Recommendation не создаёт freeze и не одобряет production.

Owner получает aggregate из успешного DEV-run, проверяет GitHub run/artifact metadata,
source/app/tooling/seal pins и его SHA, затем отдельно commits FINAL run-freeze.
FINAL payload включает точные bytes `dev_report_json`; runner сверяет его внешний
hash, schema/mode, metric/seed, source/app/candidate-artifact/model/config/seal/protocol/
binary/workflow hashes и время. Выбранный T возможен только с положительным UI_DEV
gain; owner может консервативно оставить U. Config и model SHA выбранной модели
должны совпасть с DEV-report. Нельзя открыть FINAL для решения, какой model freeze
составить, или подменить DEV-report core-оценкой. Переданные в FINAL DEV targets
используются только для seal/split verification, не для нового выбора U/T.

Mode — проверенный SDK output, не невалидированная строка пути upload-artifact.
В обоих режимах выгружается только соответствующий `{mode}-aggregate.json`;
сам bundle/event не публикуется и никогда не передаётся train workflow.

Blinded exclusions создаёт только source helper на той же public `prepare::family`:
schema `linka-eval-exclusions-v1`, normalizer `nfc-lower-v1`, `source_seal_sha256`,
families `{id,group_id,sha256,token_count,shingles}`, ширина shingle min(3,n),
domain hash включает ширину; near-duplicate Jaccard >=4/5, целые сообщения и
сегменты по .!?. JS-нормализатор dataset selfchecks не является этим normalizer
и **не используется** для создания exclusions. После готовности helper и parity
tests куратор может передать private FINAL+DEV через stdin `{id,group_id,text}`;
training owner получает только hash-only index. Генерация/коммит index и передача
bundle выполняются только по отдельному разрешению primary; до этого никакого публичного вывода.
