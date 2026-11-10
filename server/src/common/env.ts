/**
 * Единая точка чтения переменных окружения на сервере.
 *
 * Правила:
 *  - в development все адреса по умолчанию указывают на localhost,
 *    поэтому проект запускается без единого .env-файла;
 *  - в production небезопасные/неоднозначные значения (публичный адрес,
 *    строка подключения к БД) обязательны — сервер упадёт с понятной ошибкой,
 *    а не будет молча отдавать localhost-ссылки;
 *  - никакие секреты в коде не хранятся: только defaults для локальной разработки.
 *
 * `server/.env` читается здесь, ДО модульных констант, которые
 * импортируют этот файл. Путь явный (от каталога server/), поэтому файл
 * находится независимо от cwd: `cd server && npm run start:dev` и
 * `node server/dist/main.js` из корня репозитория дают одинаковый результат.
 */
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSafeInteger, validateHttpUrl, validateMongoUri } from './env-validation.js';

/**
 * Корень каталога `server` и в dev (`src/common/env.ts`), и в prod
 * (`dist/common/env.js`): `path.dirname(file)` + `../..`.
 */
export const SERVER_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

// Shell-переменные имеют приоритет: dotenv не перезаписывает уже заданные.
// quiet: не засорять логи баннером о загруженном файле.
loadDotenv({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function raw(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === '' ? undefined : value;
}

function str(name: string, fallback: string): string {
  return raw(name) ?? fallback;
}

function optionalStr(name: string): string | undefined {
  return raw(name);
}

function int(name: string, fallback: number): number {
  return parseSafeInteger(name, raw(name), fallback, 1);
}

function port(name: string, fallback: number): number {
  const value = int(name, fallback);
  if (value < 1 || value > 65535) {
    throw new Error(`Environment variable ${name} must be a valid port (1..65535), got ${value}`);
  }
  return value;
}

function list(name: string, fallback: string[]): string[] {
  const value = raw(name);
  if (value === undefined) return fallback;

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : fallback;
}

/** Убирает хвостовые слэши, чтобы `${url}/path` не давал двойной слэш. */
function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function buildMongoUri(): string {
  const explicit = optionalStr('MONGODB_URI');
  if (explicit) return validateMongoUri('MONGODB_URI', explicit);

  // В production нельзя молча подключаться к localhost: либо полная строка,
  // либо хотя бы явный хост БД (тогда URI собирается из частей).
  if (IS_PRODUCTION && !raw('MONGODB_HOST')) {
    throw new Error(
      'MONGODB_URI (or MONGODB_HOST) is not set. In production the database connection must be provided explicitly (see server/.env.example).',
    );
  }

  const host = str('MONGODB_HOST', 'localhost');
  const portNumber = port('MONGODB_PORT', 27017);
  const database = str('MONGODB_DATABASE', 'nest');
  const user = optionalStr('MONGODB_USER');
  const password = optionalStr('MONGODB_PASSWORD');
  const authSource = str('MONGODB_AUTH_SOURCE', 'admin');

  const credentials = user ? `${encodeURIComponent(user)}:${encodeURIComponent(password ?? '')}@` : '';
  const auth = user ? `?authSource=${encodeURIComponent(authSource)}` : '';

  // Локальный MongoDB без авторизации — рабочий default для разработки.
  return validateMongoUri('MONGODB_URI', `mongodb://${credentials}${host}:${portNumber}/${database}${auth}`);
}

const portNumber = port('PORT', 5000);

const publicUrl = trimTrailingSlashes(validateHttpUrl('PUBLIC_URL', str('PUBLIC_URL', `http://localhost:${portNumber}`)).toString());

const cacheEventUrl = optionalStr('CACHE_EVENT_URL');
const cacheEventSecret = optionalStr('CACHE_EVENT_SECRET');
if (Boolean(cacheEventUrl) !== Boolean(cacheEventSecret)) {
  throw new Error('CACHE_EVENT_URL and CACHE_EVENT_SECRET must be configured together');
}
if (cacheEventUrl) validateHttpUrl('CACHE_EVENT_URL', cacheEventUrl);
if (cacheEventSecret && !/^[A-Za-z0-9._~-]{32,256}$/.test(cacheEventSecret)) {
  throw new Error('CACHE_EVENT_SECRET must contain 32–256 URL-safe random characters');
}
if (IS_PRODUCTION && (!cacheEventUrl || !cacheEventSecret)) {
  throw new Error('CACHE_EVENT_URL and CACHE_EVENT_SECRET are required in production for durable cache invalidation');
}

if (IS_PRODUCTION && !raw('PUBLIC_URL')) {
  throw new Error(
    'PUBLIC_URL is not set. In production it must point to the public address of this API (e.g. https://api.example.com), otherwise media links will point to localhost.',
  );
}

export const env = {
  isProduction: IS_PRODUCTION,
  nodeEnv: str('NODE_ENV', 'development'),

  /** Интерфейс, который слушает Nest. В dev — только loopback. */
  host: str('HOST', IS_PRODUCTION ? '0.0.0.0' : 'localhost'),
  port: portNumber,

  /** Публичный адрес API (для абсолютных ссылок на статику). */
  publicUrl,

  /** Whitelist для браузерных запросов (CORS). */
  corsOrigins: list('CORS_ORIGINS', ['http://localhost:3000']),

  mongodbUri: buildMongoUri(),

  /** Абсолютный путь к каталогу статики; относительный считается от server/. */
  staticDir: path.resolve(SERVER_ROOT, str('STATIC_DIR', 'static')),

  /** Закрытый каталог промежуточной загрузки, не обслуживается веб-сервером. */
  mediaStagingDir: path.resolve(SERVER_ROOT, str('MEDIA_STAGING_DIR', '.local/media-staging')),

  /** Путь к системному ffprobe; media validation fails closed if it is unavailable. */
  ffprobePath: str('FFPROBE_PATH', 'ffprobe'),

  /** Максимальный размер одного загружаемого файла. */
  uploadMaxBytes: int('UPLOAD_MAX_MB', 50) * 1024 * 1024,

  /** Initial delay between durable media cleanup worker polls. */
  maintenancePollIntervalMs: int('MAINTENANCE_POLL_INTERVAL_MS', 5_000),

  cacheEvents: {
    callbackUrl: cacheEventUrl,
    secret: cacheEventSecret,
  },

  throttle: {
    ttlMs: int('THROTTLE_TTL_MS', 60_000),
    limit: int('THROTTLE_LIMIT', 100),
    listenLimit: int('THROTTLE_LISTEN_LIMIT', 10),
  },
} as const;

/** Абсолютный URL к пути API/статики: apiUrl('/static/audio/x.mp3'). */
export function apiUrl(pathname: string): string {
  return `${env.publicUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}
