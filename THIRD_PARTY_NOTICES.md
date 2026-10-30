# Уведомления о лицензиях и сторонних правах

- Используемый архив `@linkasu/tobii-electron` версии 0.2.16 имеет собственные
  условия, не изменяемые GPL этого приложения. В проверенной копии этого архива
  из `linka.plays-electron` манифест содержит `UNLICENSED`, текста лицензии нет,
  присутствуют `EyeLog.exe` и DLL Tobii. Права на фактически загружаемый архив и
  совместимость готовой сборки нужно проверить отдельно. Обновление лицензии
  исходного репозитория адаптера не перелицензирует старый архив автоматически.

## LINKa.смотри 3.3.1

Собственный код LINKa: GPL-3.0-or-later, полный текст в LICENSE. Сохранены авторство,
сторонние лицензии и ранее предоставленные права; эта декларация не лицензирует Tobii.

- node-eyelog: точный исходный commit
  `b1200c685fc11337e3eec1dda12045b2fdc99d3f`, GPL-3.0-or-later.
- EyeLog 1.1.3.0: исходный commit `565dbbbb300925396a7adb5aa9d630fee32502b9`.
  GPL-уточнение `57559cd4178dfaa35d8d22649ba0ac4470dab5ab` меняет только документы,
  не C# код и не бинарный SDK. Источники: https://github.com/linkasu/EyeLog.
- Release.zip, GitHub asset 467473707: 389225 bytes, SHA256
  `7d97bf05faf5688f7cabe79acdfbd78696ca989e86efb9a9e90bf301e2595d2d`.
  Хеш не является подписью поставщика.
- DLL Tobii побайтно совпадают с официальным NuGet Tobii.Interaction 0.7.3
  (Tobii AB / Tobii Interaction Engine Team, requireLicenseAcceptance=true):
  https://api.nuget.org/v3-flatcontainer/tobii.interaction/0.7.3/tobii.interaction.0.7.3.nupkg.
  SHA256 пакета: `88dcd8a8cd09492e3b7d5f21b823e72bbbcdc208756ccdab257c3b3f10bc9bf4`.
- Tobii.EyeX.Client 1.17.0.46 SHA256:
  `2a1da21d40119027cb9d86fd8527f537319790db12391de2b64f842a496007e4`;
  Tobii.Interaction.Model 0.7.3.333:
  `1beb10d956af24a84fe311bc0be78d0e1f89c5becf1bc9203555f3a927ed5835`;
  Tobii.Interaction.Net 0.7.3.333:
  `1b8036dbdf9f8b15c48edd90793c58d10467c61e2a80f06454993625925f9e2d`.
- Условия Tobii остаются отдельными и не заменены GPL:
  https://developer.tobii.com/wp-content/uploads/2017/06/Tobii_Core_SDK_and_Gaming_SDK_License_Agreement_v_2.pdf
  (документ v1.2: §§3.1–3.3, 5, сохранение proprietary notices).

EyeLog напрямую использует закрытые DLL Tobii; потенциальное расхождение условий
GPL и SDK раскрыто владельцу, который 30 октября 2026 разрешил публикацию с этим
риском. Это не linking exception, не разрешение от Tobii и не заключение о полной
лицензионной совместимости. Исходные архивы релиза не объявляются полным
corresponding source для proprietary Tobii. SDK требует x86/VC110 runtime;
physical Tobii/calibration/gaze, полный SDK runtime и installer-update NOT VERIFIED.
