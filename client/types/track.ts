// types/track.ts

/** Комментарий приходит с Nest в формате its toJSON (после timestamps: true). */
export interface IComment {
  _id: string
  username: string
  text: string
  /** ISO-строка, появляется после включения timestamps в схеме Comment */
  createdAt?: string
  rating?: number
}

/**
 * Трек в том виде, в каком его отдаёт Nest:
 * `_id`, `lyrics` (в БД поле называется `text`) и абсолютные URL
 * `picture` / `audio` (формирует сервер, см. server/src/common/api-json.util.ts).
 * У старых треков в БД `picture`/`audio` может не быть — тогда там `null`.
 */
export interface ITrack {
  _id: string
  name: string
  artist?: string | null
  lyrics?: string | null
  listens: number
  picture?: string | null
  audio?: string | null
  comments: IComment[]
}
