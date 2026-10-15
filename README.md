# Gurach

Музыкальный плеер: **NestJS + MongoDB (Docker)** на бэкенде, **Next.js 16** на фронтенде.

## Стек

| Часть    | Технология                                   |
| -------- | -------------------------------------------- |
| БД       | MongoDB в Docker (`docker-compose.yml`)      |
| Сервер   | NestJS + Mongoose, порт `5000`               |
| Клиент   | Next.js 16 (App Router, Cache Components), порт `3000` |

## Как запустить

```bash
# 1. База данных (контейнер my-app-mongodb, порт 27017)
docker compose up -d

# 2. Бэкенд (Nest) — отдельный терминал
cd server && npm run start:dev     # http://localhost:5000

# 3. Фронтенд (Next) — отдельный терминал
cd client && npm run dev           # http://localhost:3000
```

Проверка, что цепочка «БД → Nest» живая:

```bash
curl http://localhost:5000/tracks
```

## Настройки

- **Клиент** — `client/.env.local`: `API_URL=http://localhost:5000` (адрес Nest).
  Изменения этого файла применяются только после перезапуска `next dev`.
- **Сервер** — `server/.env` (переменные передаются в окружение при запуске):

  | Переменная     | Назначение                                     | По умолчанию                                        |
  | -------------- | ---------------------------------------------- | --------------------------------------------------- |
  | `MONGODB_URI`  | строка подключения к MongoDB из docker-compose | `mongodb://michael:1111@localhost:27017/nest?authSource=admin` |
  | `PORT`         | порт Nest                                       | `5000`                                              |
  | `PUBLIC_URL`   | публичный адрес для URL обложек и аудио        | `http://localhost:5000`                             |
  | `STATIC_DIR`   | каталог статики (`static/audio`, `static/picture`) | `server/static`                                 |

## Как связаны сервер и клиент

1. **Данные.** Next ходит в Nest по `API_URL` из серверных функций
   (`client/features/tracks/api/getTracks.ts`, `getTrack.ts`) и через
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

## Наполнение БД

В `nest` уже есть ~106 треков. Чтобы добавить новые:

```bash
cd server && ./seed.sh   # нужны ~/Cover.jpg и ~/islam.mp3
```
