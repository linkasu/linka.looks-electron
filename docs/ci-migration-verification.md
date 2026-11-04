# Проверка миграции CI — 2026-11-04

Это запись проверок перехода, не ручное разрешение на публикацию. Источником
release eligibility остаются GitHub origins, candidate bytes и qualification
receipts. Опубликованные v4.0.0/base-ru-v1 не изменялись.

- App migration: [PR #166](https://github.com/linkasu/linka.looks-electron/pull/166).
  Его CI-only маршрут выполнил fast/native contracts без app build.
- Model migration: [PR #9](https://github.com/linkasu/linka.predictor-rust/pull/9).
  Native/runtime/transport проверки прошли; обучения и DEV/FINAL не выполнялось.
- [Полный explicit CI canary](https://github.com/linkasu/linka.looks-electron/actions/runs/41854564494)
  прошёл на `3e88ec6f02383b4ae7d0cf98e67cd31a189c7ea7`: fast, unit и одна Windows
  integration build. Сетевой обрыв локального watcher не был признан CI failure;
  фактический SUCCESS подтверждён через GitHub API.
- [Candidate build](https://github.com/linkasu/linka.looks-electron/actions/runs/41855049171)
  прошёл один раз. Descriptor artifact ID `13337430830`; Windows ZIP 149646569 bytes,
  source ZIP 141751776 bytes, security ZIP 252185 bytes. Upgrade больше не скачивает
  старый совмещённый пакет около 931 MB.
- [Qualification retry canary](https://github.com/linkasu/linka.looks-electron/actions/runs/41855535262)
  показал два корректно заблокированных исхода: transport failure software gate и
  непризнанную проекцию reused job в latest API. Во второй попытке genuine Windows
  scenario и security прошли, но failed aggregate не выдавал release eligibility.
  Регрессия сохраняет реальные API-формы original attempt и current projection;
  исправление проверяет обе, не переписывая producing attempt.
- [Первый hosted public probe](https://github.com/linkasu/linka.looks-electron/actions/runs/41855099967)
  подтвердил GitHub publication, но получил сетевой INFRA_ERROR на public version
  endpoint. Обе SSH/update стадии были пропущены. Это не доказательство падения
  origin и не причина пересобирать/перепубликовывать приложение.

Статическая проверка: formatting, typecheck, Knip и actionlint прошли; ESLint не
имеет ошибок, существующее предупреждение typingLayout не скрыто. Fast contracts
первой ревизии: 387 PASS и 2 platform-only SKIP; Python payload suites: 45 PASS.
Book Linux ARM64, pinned ec07 tiny runtime, неизменённый app source tree: frontend
401 PASS/1 существующий TTS SKIP, main/storage 141 PASS. Skip не засчитан как PASS.

На main добавлен required check `ci-required` от GitHub Actions app 15368 с strict
base checking. Existing owner restrictions, force-push/deletion/admin flags сохранены.
`release-production` требует reviewer `ibakaidov` и допускает protected branches.
Write switch удерживался выключенным во время canaries; его текущее значение нужно
проверять в repo variables, а не выводить из этой исторической записи.

Book worker и только task-owned Colima profile `linka-model-400` остановлены после
сохранения результатов. Другие VM/profiles и пользовательские файлы не затрагивались.
Physical hardware, consumer Windows и installer downgrade не подтверждались этими
проверками. Для актуального результата выбирать последний точный candidate/run,
а не превращать прошлый failed/diagnostic artifact в зелёную квалификацию.
