# LINKa.смотри 3.3.1

Обновлены Electron и зависимости, закреплена безопасная установка EyeLog SDK.
Сохранены режимы стрелок страниц (#128) и перенос/размер картинок из текста (#129).
T9 (#130) в этот выпуск не входит.

Windows x64: установщик собран на Windows 2022; наличие цифровой подписи Windows
не заявляется. macOS x64/arm64: публикация допускается только после CI signing,
notarization, stapling, Gatekeeper, raw-ASAR/native payload и полного сравнения
signed app с ZIP/DMG. Продвигаются принятые байты без пересборки.

Прилагаются provenance с app/tooling SHA, CI run ID и SHA256, а также исходные
архивы приложения/инструментов, закреплённые исходники node-eyelog/EyeLog и
сохранённые уведомления. Собственный код LINKa — GPL-3.0-or-later. Условия Tobii
остаются отдельными: см. упакованные LICENSE и THIRD_PARTY_NOTICES.md.
Потенциальное расхождение GPL/закрытого SDK раскрыто и принято владельцем;
полная лицензионная совместимость и полный corresponding source Tobii не заявляются.

**NOT VERIFIED:** physical Tobii/calibration/gaze, полный SDK runtime и реальное
installer-update. Hosted Windows smoke подтверждает только узкую классификацию
отсутствия x86 VC110 runtime, не работоспособность устройства.

Audit не нулевой: на предыдущей software-tested базе оставались 8 advisories
(0 critical, 2 high, 5 moderate, 1 low); production — 2 high (Vue SSR, без найденной
app SSR-точки входа). Это оценка достижимости, не доказательство отсутствия риска.
