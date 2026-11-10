import 'server-only'
import { normalizeHttpBaseUrl } from './url'

/**
 * Единая точка чтения переменных окружения в клиенте.
 *
 * Используется только на серверной стороне Next (server components,
 * route handlers) — браузер ходит в Nest через прокси `/api/*`, поэтому
 * NEXT_PUBLIC_* переменные не нужны.
 *
 * Правила:
 *  - нет `API_URL` → для локальной разработки берётся http://localhost:5000;
 *  - в production `API_URL` обязателен и при сборке, и в рантайме:
 *    страницы с 'use cache' пререндерятся и иначе «запекут» localhost-ссылки.
 */

const DEFAULT_API_URL = 'http://localhost:5000'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function readApiUrl(): string {
  const raw = process.env.API_URL?.trim()

  if (!raw) {
    if (IS_PRODUCTION) {
      throw new Error(
        'API_URL is not set. A production build/run must know the public address of the Nest API (e.g. https://api.example.com), otherwise pages would be baked with localhost links. See client/.env.example.',
      )
    }
    // Локальная разработка: backend по умолчанию на том же localhost.
    return DEFAULT_API_URL
  }

  return normalizeHttpBaseUrl('API_URL', raw)
}

/** Адрес Nest-бэкенда без хвостового слэша. */
export const API_URL = readApiUrl()

/** Абсолютный URL к пути API: apiUrl('/tracks') → `${API_URL}/tracks`. */
export function apiUrl(pathname: string): string {
  return `${API_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}
