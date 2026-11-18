# Gurach

[![CI](https://github.com/MichaelAry/Gurach/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MichaelAry/Gurach/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2F6-3178C6?style=flat-square&logo=typescript&logoColor=white)](client/package.json)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-171717?style=flat-square&logo=nextdotjs&logoColor=white)](client/package.json)
[![NestJS 12](https://img.shields.io/badge/NestJS-12-E0234E?style=flat-square&logo=nestjs&logoColor=white)](server/package.json)
[![MongoDB](https://img.shields.io/badge/MongoDB-replica%20set-146B3A?style=flat-square&logo=mongodb&logoColor=white)](docker-compose.dev.yml)
[![Node.js 24](https://img.shields.io/badge/Node.js-24-417E38?style=flat-square&logo=nodedotjs&logoColor=white)](.node-version)
[![Интерфейс EN и RU](https://img.shields.io/badge/UI-EN%20%2F%20RU-605C7A?style=flat-square)](docs/implementation/localization.md)

**Gurach — веб-плеер с общим музыкальным каталогом, личными плейлистами и лентой друзей.** Каталог и плеер доступны без аккаунта. Войдя в аккаунт, можно загружать треки, сохранять музыку в избранное, делиться плейлистами по ссылке и следить за новыми публикациями друзей.

[Возможности](#возможности) · [Скриншоты](#скриншоты) · [Установка](#установка) · [Локальный запуск](#локальный-запуск) · [Документация](#документация)

## Возможности

- **Каталог и плеер.** Поиск по названию или исполнителю, страницы треков и очередь, которую можно менять прямо во время прослушивания. Плеер остаётся доступным при переходе между страницами и запоминает позицию.
- **Личная коллекция.** Избранное и приватные плейлисты. Плейлистом можно поделиться по ссылке для просмотра, не добавляя его в общий каталог.
- **Главная.** Продолжение прослушивания, новые треки, подбор по исполнителям из недавних прослушиваний и избранного, а также активность друзей.
- **Друзья и обсуждения.** Профили, заявки в друзья, комментарии к трекам и личные уведомления о заявках и новых комментариях к своим трекам.
- **Публикация музыки.** Загрузка аудио с обложкой и метаданными, фоновая обработка и проверка на дубликаты.
- **Два языка.** Английский по умолчанию, русский можно выбрать в интерфейсе.

## Скриншоты

Скриншоты будут добавлены отдельно.

<!--
Когда изображения будут готовы, положите их в docs/screenshots/
и вынесите ссылки ниже из комментария:

![Главная страница Gurach](docs/screenshots/home.webp)
![Каталог и плеер Gurach](docs/screenshots/catalogue.webp)
![Плейлисты Gurach](docs/screenshots/playlists.webp)
-->

## Стек

| Часть | Технологии |
| --- | --- |
| Клиент | Next.js 16, React 19, TypeScript, Material UI |
| API | NestJS 12, TypeScript, OpenAPI |
| Данные | MongoDB, Mongoose, локальный replica set в Docker Compose |
| Аудио | FFmpeg, Chromaprint |
| Проверки | GitHub Actions, Vitest, Playwright |

## Установка

Установщик рассчитан на Windows 11 x64 с WSL 2 и Ubuntu 24.04 x64 с systemd. Для первой установки нужны интернет и права администратора для настройки Docker.

- **Windows.** Распакуйте `Gurach-installer.zip` из [релизов](https://github.com/MichaelAry/Gurach/releases) и дважды нажмите `install.cmd`. Если потребуется перезагрузка, войдите в ту же учётную запись.
- **Ubuntu.** Скачайте `Gurach-installer.tar.gz` из релизов и выполните команды в каталоге загрузки.

  ```sh
  mkdir -p gurach-installer
  tar -xzf Gurach-installer.tar.gz -C gurach-installer
  cd gurach-installer
  sh install.sh
  ```

Из полной копии исходников запустите тот же установщик из корня репозитория. После установки откройте [localhost:3000](http://localhost:3000). Логин первого администратора — `gurach`. Пароль находится в строке `GURACH_INITIAL_PASSWORD` файла `install.env` по пути, который выводит установщик.

Требования к системе, настройка портов, остановка и диагностика описаны в [руководстве по установке](docs/installation.md).

## Локальный запуск

Нужны Bash, Node.js из [`.node-version`](.node-version), npm `>=11.19.0 <12` и запущенный Docker с Compose v2. Для загрузки и обработки аудио нужны `ffmpeg`, `ffprobe`, `fpcalc` и `prlimit`. Клиент и сервер — отдельные npm-пакеты.

Из корня репозитория установите зависимости и поднимите MongoDB:

```bash
npm ci --prefix client
npm ci --prefix server
node scripts/dev-db.mjs up
```

В отдельном терминале, также из корня, запустите API:

```bash
cd server
set -a && source ../.local/mongo/app.env && set +a
PUBLIC_URL=http://localhost:5000 CORS_ORIGINS=http://localhost:3000 npm run start:dev
```

В третьем терминале из корня запустите клиент:

```bash
API_URL=http://localhost:5000 APP_ORIGIN=http://localhost:3000 npm run dev --prefix client
```

Откройте [localhost:3000](http://localhost:3000). Готовность API можно проверить на [localhost:5000/health/ready](http://localhost:5000/health/ready).

> Новая база пуста. Скрипт запуска не загружает демоданные и не применяет миграции. Самостоятельная регистрация по умолчанию выключена. Для настройки аккаунтов, загрузки треков и других функций с отдельными требованиями см. [руководство разработчика](docs/development.md) и [инструкцию по миграциям](docs/execution/migrations.md).

## Документация

- [Руководство разработчика](docs/development.md) — настройки окружения, база, миграции, запуск проверок.
- [Архитектура](docs/architecture-review.md) · [Схема БД](DBScheme.png) · [Контракт OpenAPI](server/openapi.json)
- [Главная](docs/implementation/home.md) · [Друзья](docs/execution/friends.md) · [Уведомления](docs/execution/notifications.md)
- [Обработка аудио](docs/implementation/background-media.md) · [Управление регистрацией и аккаунтами](docs/implementation/controlled-registration.md) · [Локализация](docs/implementation/localization.md)
