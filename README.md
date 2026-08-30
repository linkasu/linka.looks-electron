# linka.looks-electron

<details>
<summary>Локальная работа с проектом</summary>

## Project setup

```
npm ci
```

### Development server start

```
npm run electron:serve
```

### Compiles and minifies for production

```
npm run electron:build
```

### Run your unit tests

```
npm run test:unit
```

### Customize configuration

Build configuration lives in `vite.config.ts` and `package.json`.

</details>

## Техническая статистика

Приложение не отправляет технические события, пока пользователь явно не разрешит это в первом уведомлении. Уведомление можно отложить без ограничения основной или offline-работы; состояние останется неопределённым и события отправляться не будут. Выбор сохраняется на устройстве и изменяется в настройках.

События содержат только идентификатор активированной установки, название действия и версию приложения. Содержимое карточек, названия файлов, пути и тексты ошибок не отправляются. Активация и работа без интернета не зависят от этого выбора.

---

<details>
<summary>Как оформить багрепорт</summary>

- заходите в issues https://github.com/linkasu/linka.looks-electron/issues
- нажимаете на кнопку `new issue`
- описываете проблему по шаблону:

```
Проблема возникла на странице
...

Ожидаемое поведение
...

Реальное поведение
...
```

- после того, как issue создан, добавляете к нему label `bug`

</details>
