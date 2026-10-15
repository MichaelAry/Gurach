/**
 * Единый формат JSON-ответов API.
 *
 * Клиент (Next.js) ожидает `_id`, `lyrics` и абсолютные URL обложек/аудио,
 * поэтому нормализация делается на стороне сервера: клиентский код
 * остаётся без изменений, а в БД ничего мигрировать не нужно.
 */

/** Публичный адрес сервера (см. server/.env), без хвостового слэша. */
export const PUBLIC_URL = (
  process.env.PUBLIC_URL ?? 'http://localhost:5000'
).replace(/\/+$/, '');

type StaticDir = 'audio' | 'picture';

/** Имя файла из БД → абсолютный URL статики Nest (`/static/...`). */
export function staticUrl(dir: StaticDir, name?: string | null): string | null {
  return name ? `${PUBLIC_URL}/static/${dir}/${name}` : null;
}

type Json = Record<string, any>;

/**
 * Трансформ для `toJSON`: оставляет `_id` как есть (не переименовывает в `id`),
 * убрает `__v` и вызывает `decorate` для специфики схемы.
 */
export function createApiTransform(decorate?: (ret: Json) => void) {
  return (_doc: unknown, ret: Json): Json => {
    delete ret.__v;
    decorate?.(ret);
    return ret;
  };
}

/** Трансформ схемы Track: URL медиа + `text` → `lyrics`. */
export const trackApiTransform = createApiTransform((ret) => {
  ret.picture = staticUrl('picture', ret.picture);
  ret.audio = staticUrl('audio', ret.audio);
  ret.lyrics = ret.text ?? null;
  delete ret.text;
});
