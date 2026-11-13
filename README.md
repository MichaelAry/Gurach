# Gurach

Музыкальный плеер: **NestJS 12 + MongoDB** на бэкенде, **Next.js 16** на фронтенде.
Поддерживаемая среда: Node `24.21.0` (см. [.node-version](.node-version)), npm `>=11.19.0 <12`; оба пакета требуют Node `>=24.21.0 <25`. Зависимости клиента и сервера устанавливаются отдельно, корневого npm-пакета нет.

## Стек

| Часть    | Технология                                   |
| -------- | -------------------------------------------- |
| БД       | MongoDB в Docker, локальный single-node `rs0` |
| Сервер   | NestJS + Mongoose, порт `5000`               |
| Клиент   | Next.js 16 (App Router, Cache Components), порт `3000` |

## Как запустить

Нужны Docker с Compose v2 и работающим daemon, а также системный пакет
FFmpeg: сервер использует `ffprobe` для проверки медиа, тесты создают аудио
через `ffmpeg`. Оба исполняемых файла должны быть доступны в `PATH`
(для серверного `ffprobe` можно задать `FFPROBE_PATH`).

Команды ниже выполняются из корня клона в Bash.

```bash
npm ci --prefix client
npm ci --prefix server
ffmpeg -version
ffprobe -version

# 1. Рекомендуемая локальная БД (приватные креды создаются один раз)
node scripts/dev-db.mjs up

# 2. Бэкенд (Nest) — отдельный терминал
cd server
set -a && source ../.local/mongo/app.env && set +a
PUBLIC_URL=http://localhost:5000 CORS_ORIGINS=http://localhost:3000 \
  npm run start:dev                # http://localhost:5000

# 3. Фронтенд (Next) — отдельный терминал
cd client
API_URL=http://localhost:5000 APP_ORIGIN=http://localhost:3000 \
  npm run dev                     # http://localhost:3000
```

Новая dev-база пуста: `up` не восстанавливает baseline и не применяет миграции.
Этот путь запускает процессы; перед использованием входа, очереди, друзей
и загрузки проверьте необходимые индексы в разделе «Миграции» ниже.

Проверка, что цепочка «БД → Nest» живая:

```bash
curl http://localhost:5000/health/ready
curl http://localhost:5000/tracks
```

## Настройки

Все адреса и секреты — через переменные окружения. Для локальной разработки
env-файлы создавать не обязательно: shell-переменных из примера запуска достаточно.
Однако default Mongo URI ведёт в `localhost:27017/nest`, а dev-скрипт запускает
другую базу: для неё обязательно загрузите `MONGODB_URI` из `app.env`.

```bash
cp server/.env.example server/.env      # опционально: переопределить настройки Nest
cp client/.env.example client/.env.local # опционально: адрес Nest для Next
```

`node scripts/dev-db.mjs up` создаёт loopback-only Mongo replica set на
`127.0.0.1:27028`, с отдельным app user и персистентным volume. Его секреты
хранятся в игнорируемом `.local/mongo/`; bootstrap root credentials не следует
копировать в `server/.env`. Для подключения Nest возьмите `MONGODB_URI` из
`.local/mongo/app.env` и поместите его в `server/.env` или экспортируйте в shell.
Старый `docker-compose.yml` оставлен для доступа к исходному контейнеру/volume;
новая dev-база запускается только через `scripts/dev-db.mjs`.

Проверка состояния: `node scripts/dev-db.mjs status`, `curl
http://localhost:5000/health/live` и `curl http://localhost:5000/health/ready`.
Обычный restart — `node scripts/dev-db.mjs down` и затем `up`. Не используйте
`docker compose down -v`: именованный volume содержит данные.

Конфиги читаются в одном месте: `server/src/common/env.ts` и `client/config/env.ts`.

### Сервер — `server/.env`

Файл читается по пути `server/.env` независимо от рабочего каталога процесса,
переменные из shell имеют приоритет над файлом.

| Переменная              | Назначение                                             | По умолчанию              |
| ----------------------- | ------------------------------------------------------ | ------------------------- |
| `NODE_ENV`              | `development` / `production` / `test`                  | `development`             |
| `HOST`                  | интерфейс, который слушает Nest                        | `localhost` (`0.0.0.0` в prod) |
| `PORT`                  | порт Nest                                              | `5000`                    |
| `PUBLIC_URL`            | публичный адрес API для ссылок на `static/...`         | `http://localhost:5000`   |
| `CORS_ORIGINS`          | whitelist браузерных запросов через запятую             | `http://localhost:3000`   |
| `MONGODB_URI`           | полная строка подключения (приоритетная)               | для dev topology берётся из `.local/mongo/app.env` |
| `MONGODB_HOST`          | хост MongoDB (если нет `MONGODB_URI`)                   | `localhost`               |
| `MONGODB_PORT`          | порт MongoDB                                           | `27017`                   |
| `MONGODB_DATABASE`      | имя базы                                               | `nest`                    |
| `MONGODB_USER`, `MONGODB_PASSWORD`, `MONGODB_AUTH_SOURCE` | креды (опционально)     | —                         |
| `STATIC_DIR`            | каталог статики, относительно `server/`                 | `static`                  |
| `MEDIA_STAGING_DIR`     | закрытый каталог приема файлов, вне `STATIC_DIR`        | `.local/media-staging`    |
| `FFPROBE_PATH`          | путь к `ffprobe` из пакета FFmpeg                         | `ffprobe`                 |
| `UPLOAD_MAX_MB`         | максимальный размер одного загружаемого файла, МБ      | `50`                      |
| `MAINTENANCE_POLL_INTERVAL_MS` | интервал worker очистки медиа и доставки cache events, мс | `5000` |
| `CACHE_EVENT_URL` | фиксированный callback Next для инвалидации кеша | не задан; локально `http://localhost:3000/api/internal/cache-events` |
| `CACHE_EVENT_SECRET` | общий с Next секрет, 32–256 случайных URL-safe символов | не задан |
| `THROTTLE_TTL_MS`       | окно rate limit, мс                                    | `60000`                   |
| `THROTTLE_LIMIT`        | общий лимит запросов на IP за окно                     | `100`                     |
| `THROTTLE_LISTEN_LIMIT` | лимит на `POST /tracks/:id/listen` за окно             | `10`                      |

### Клиент — `client/.env.local`

| Переменная | Назначение                                | По умолчанию            |
| ---------- | ----------------------------------------- | ----------------------- |
| `API_URL`  | адрес Nest (server components и прокси `/api/*`) | `http://localhost:5000` |
| `APP_ORIGIN` | точный origin браузера без завершающего `/`, для проверки мутаций | `http://localhost:3000` в dev; в production обязателен |
| `CACHE_EVENT_SECRET` | тот же приватный секрет, что у Nest | не задан |

Для доставки cache events задайте в Nest одновременно `CACHE_EVENT_URL` и
`CACHE_EVENT_SECRET`, а в Next — тот же секрет. В development эта связка
опциональна; без неё доставка событий инвалидации кеша не настроена.
Эти переменные используются на сервере Next, префикс `NEXT_PUBLIC_` не нужен.

Изменения `client/.env.local` применяются только после перезапуска `next dev`.

### Legacy Docker Compose — `.env` в корне репозитория

| Переменная             | Назначение                    | По умолчанию       |
| ---------------------- | ----------------------------- | ------------------ |
| `MONGO_USER`           | bootstrap root MongoDB        | задаётся локально  |
| `MONGO_PASSWORD`       | bootstrap root пароль         | задаётся локально  |
| `MONGO_PORT`           | порт MongoDB на хосте         | `27017`            |
| `MONGO_CONTAINER_NAME` | имя контейнера                | `my-app-mongodb`   |

Для изолированных интеграционных тестов выполните `cd server && npm run
test:isolated`: команда поднимает одноразовый Mongo на случайном loopback-порту,
использует БД `gurach_test_<run>` и удаляет только собственный контейнер.
Прямой `test:integration` требует явный URI с этим префиксом. Staging должен
использовать отдельную БД `gurach_staging_<name>` и приватный URI; такая БД
недопустима для integration tests. Тесты удаляют только созданные ими документы
и не дропают БД. Не запускайте `seed.sh` против dev/staging без явного намерения.

Seed принимает явные локальные файлы и параметры, например:

```bash
cd server
COVER_PATH=/path/to/cover.jpg AUDIO_PATH=/path/to/audio.mp3 COUNT=100 \
  API_URL=http://localhost:5000 REQUEST_DELAY_MS=700 ./seed.sh
```

Скрипт ограничивает batch 100 треками и держит интервал запросов выше общего
rate limit по умолчанию. Backup рекомендуемой базы: `node scripts/dev-db.mjs
backup`; архив сохраняется с правами пользователя в игнорируемом `.local/backups/`.
`restore-baseline` предназначен только для пустой `gurach` в новой dev-базе и
откажется импортировать данные, если там уже есть tracks/comments. Перед
восстановлением пользовательского backup сначала поднимайте отдельную базу и
проверяйте содержимое архива; исходный volume не переиспользуйте.

Для медиазагрузок серверу нужен системный `ffprobe` (пакет FFmpeg); при
нестандартном расположении задайте абсолютный `FFPROBE_PATH`. `STATIC_DIR`
содержит публикуемые `audio/` и `picture/`, а `MEDIA_STAGING_DIR` содержит
временные загрузки вне публичного mount и с правами только владельца.
`scripts/dev-db.mjs backup` архивирует MongoDB, но не медиафайлы. Для полноценной
резервной копии остановите загрузки и обслуживание, убедитесь, что незавершенные
операции обработаны или сохраните staging вместе с базой, и архивируйте MongoDB,
`STATIC_DIR` и при необходимости приватный staging в одном согласованном окне.
При восстановлении верните файлы в ту же структуру до запуска Nest и сверьте
ссылки треков. Карантин `.local/media-quarantine/` храните отдельно до завершения
ручной проверки: reconciliation не является backup-системой и не удаляет
карантин автоматически.

### Production

- `NODE_ENV=production` требует явных `PUBLIC_URL` и адреса БД
  (`MONGODB_URI` или `MONGODB_HOST`) — сервер упадёт с понятной ошибкой
  вместо молчаливых localhost-ссылок.
- На клиенте в production `API_URL` обязателен и для `next build`, и для
  `next start`: без него сборка/запуск падают с понятной ошибкой, чтобы
  пререндеренные страницы не «запекли» localhost-ссылки.
- В Nest обязательны также `CACHE_EVENT_URL` и `CACHE_EVENT_SECRET`; в Next
  задайте тот же секрет для приёма cache events. Для приватных browser-мутаций
  Next требует явный `APP_ORIGIN`, совпадающий с origin браузера.
- `CORS_ORIGINS` должен содержать домен фронтенда, а `HOST` — `0.0.0.0`,
  если сервер работает в контейнере/за reverse-proxy.

## Как связаны сервер и клиент

1. **Данные.** Next ходит в Nest по `API_URL` из серверных функций
   (`client/features/tracks/api/getTracksPage.ts`, `getTrack.ts`) и через
   route handlers-прокси `client/app/api/tracks/*`.
2. **Формат ответа.** Нормализация на стороне сервера
   (`server/src/common/api-json.util.ts`): `_id` (не `id`), `text` → `lyrics`,
   `picture`/`audio` → абсолютные URL вида `PUBLIC_URL/static/...`,
   у комментариев включены `timestamps` → есть `createdAt`.
3. **Запросы из браузера.** Счётчик прослушиваний шлётся на
   `POST /api/tracks/:id/listen` — это Next route handler, который проксирует
   запрос к Nest, поэтому браузеру не нужен CORS.
4. **Плеер.** `client/components/player/` — глобальный контекст с одним
   `<audio>` и нижний бар (`PlayerBar`), доступны на всех страницах `(main)`.
   Позиция сохраняется при уходе со страницы, воспроизведение восстанавливается
   на паузе. Service Worker в HTTPS (или localhost) сохраняет в Cache Storage
   окно аудио впереди текущей позиции с целевым запасом 5 секунд, заголовок
   и конец контейнера; остальные данные плеер получает обычными Range-запросами.
   Для VBR соответствие времени байтам приблизительное, поэтому окно сохраняется
   с запасом. Общий лимит кэша — 16 МиБ. API должен поддерживать Range и открывать
   `Content-Range` через CORS; без хранилища или Service Worker работает обычная
   загрузка аудио.

## Наполнение БД

Загруженные треки попадают в общий каталог: читать каталог и слушать музыку
могут все пользователи, включая гостей. Для загрузки требуется вход. Сервер
назначает владельцем текущий аккаунт; удалить трек может только этот владелец
или администратор. Старые треки без владельца может удалять только администратор.
Поля владельца и роли в запросе не дают дополнительных прав.

Приватный P0 baseline содержит 106 треков, но архив не входит в Git.
При наличии `.local/execution/p0/restart/mongodb.archive` команда
`node scripts/dev-db.mjs restore-baseline` отдельно восстанавливает его в пустую
базу `gurach`; обычный `up` этого не делает. Чтобы добавить seed-данные,
используйте явные файлы и параметры из примера выше; `seed.sh` не читает файлы из домашнего каталога.

## Текущие возможности

- Регистрация, вход и выход работают через Next BFF и серверные сессии.
  После входа `returnTo` возвращает на разрешённую внутреннюю страницу,
  сохраняя query и fragment; небезопасный адрес заменяется на `/`.
- Форма `/upload` отправляет аудио, обложку и метаданные в Nest и показывает
  ошибки. Дубликат активного трека по нормализованным названию и исполнителю
  отклоняется с `409 TRACK_DUPLICATE`; при наличии ID форма даёт ссылку на
  существующий трек. Для загрузки необходим индекс миграции `008`.
- Очередь интегрирована с плеером и вмещает до 100 вхождений: добавление,
  перестановка, удаление выбранных/первых/недоступных и очистка. Гостевая очередь
  хранится в браузере, очередь аккаунта — на сервере; после входа предлагается
  явный выбор переноса гостевой очереди. В строке трека одна кнопка добавления.
- Главная показывает релизы, рекомендации и активность друзей. «Популярное за
  7 дней» учитывает прослушивания вошедших пользователей; гостевые не входят.
  Личная недельная сводка ограничена последними 30 прослушиваниями.

Подробности и ограничения главной: [docs/implementation/home.md](docs/implementation/home.md).
Публичные плейлисты и отдельная история позиции воспроизведения не реализованы.
Наличие реализации не означает завершение production-приёмки.

## Миграции

Приложение не применяет миграции автоматически; глобальный Mongoose `autoIndex`
отключён. Перед эксплуатацией проверьте схему и индексы целевой базы:

- `004-auth-indexes` — уникальные индексы аккаунтов/токенов и TTL сессий
  (SessionService также явно создаёт их при старте).
- `006-queue-indexes` — уникальная очередь на пользователя.
- `007-social-relations` — индексы отношений, заявок, блокировок и квот дружбы.
- `008-track-identity` — ключи активных треков и уникальный индекс
  `track_active_name_artist_unique` по названию и исполнителю. Нормализация:
  NFC, trim, схлопывание пробелов, нижний регистр; пустой и отсутствующий
  исполнитель совпадают. План останавливается при старых дублях, которые
  оператор должен разрешить вручную. До plan/apply/verify остановите writers;
  успешная проверка должна показать ноль проблем. Без совместимого индекса
  сервер останавливает загрузку с `503`.

Исключения из установки индексов только миграциями: SessionService создаёт
индексы пользователей/сессий, а HomeService — индексы запросов главной при
старте. Это не устанавливает индексы очереди, дружбы или дедупликации.

Для старых данных также зарегистрированы `001-track-lifecycle`,
`002-comment-parents`, `003-remove-track-comment-arrays`; порядок и условия
rehearsal описаны в [docs/execution/migrations.md](docs/execution/migrations.md).
Существующий runner разрешает **apply только в изолированные `gurach_test_*`**.
Он пока не является способом установки в dev-базу `gurach`, staging или
production. Для рабочей базы нужна отдельно согласованная процедура с backup
и проверкой восстановления; обходить ограничение переименованием базы нельзя.
Не считайте новую dev-базу готовой ко всем функциям сразу после `up`.

## Друзья

Раздел `/friends` содержит поиск пользователей, друзей, входящие и исходящие
заявки и блокировки. Профили доступны авторизованным пользователям по
`/users/[username]`. Перед использованием требуется отдельно применить
миграцию `007-social-relations`; автоматически она не запускается.
Подробности API, конкуренции, лимитов и установки:
[Система друзей](docs/execution/friends.md).

## Архитектура и дальнейшие изменения

Подробный разбор, выполненные исправления и приоритеты: [docs/architecture-review.md](docs/architecture-review.md).

Исторический план этапов с зависимостями, миграциями и критериями готовности (статус сверяйте с кодом и текущими ограничениями выше): [docs/implementation-plan.md](docs/implementation-plan.md).

Пошаговое выполнение P0–P8: [START-HERE](docs/execution/START-HERE.md). Готовый промпт для запуска: [RUN-PROMPT](docs/execution/RUN-PROMPT.md). Прогресс реализации: [progress.json](docs/execution/progress.json).

Серверный транспорт Next централизован в `client/lib/server/backend.ts`; кешированием владеют функции чтения в `features/tracks/api`. Каталог загружает курсорные страницы по 20 элементов, API принимает до 100 на страницу. Счётчик в интерфейсе использует подтверждённый ответ `{ listens }` от Nest. Основная оболочка содержит `ListenCountsProvider` и `PlayerProvider`; провайдер темы отвечает за MUI.

## Проверки и CI

Локальные команды:

```bash
npm ci --prefix client && npm ci --prefix server
npm test --prefix client && npm run typecheck --prefix client && npm run lint --prefix client
npm test --prefix server && npm run typecheck --prefix server && npm run tools:check-config --prefix server && npm run lint --prefix server && npm run build --prefix server
npm run contracts:check --prefix server
API_URL=http://127.0.0.1:5000 npm run build --prefix client
npm run test:isolated --prefix server
(cd client && npx playwright install --with-deps chromium)
CI=1 npm run test:e2e --prefix client
```

Дополнительно типы клиента сверяются командой `npm run api:check --prefix client`.
`test:isolated` требует Docker, media-тесты — FFmpeg/ffprobe. Playwright smoke
сам запускает fixture API на `5300` и Next на `3200`; это не проверка живой Mongo
или реального Nest. Не задавайте внешний `API_URL` при запуске этого smoke.
GitHub Actions workflow `.github/workflows/ci.yml` выполняет install/static/build,
authenticated Mongo replica-set integration и Playwright browser smoke. CI remote
результаты видны в GitHub Actions после push/PR; локальная проверка workflow не
подменяет удалённый запуск.

Изменения схемы и данных должны сопровождаться явной миграцией и rehearsal на
копии backup; не используйте production volume для экспериментов. P0 baseline
архив и текущие локальные backups находятся в игнорируемом `.local/` и не входят
в Git. Production-приёмка, применение миграций к рабочим данным, проверка
восстановления и реальные браузерные сценарии требуют отдельного подтверждения.
Этот README не утверждает, что удалённый CI прошёл или все пункты roadmap готовы.
