import { readApiError } from '@/lib/api/error'

export class DuplicateTrackError extends Error {
  constructor(readonly existingTrackId?: string) {
    super('Активный трек с таким названием и исполнителем уже существует.')
  }
}

const UPLOAD_ERRORS: Record<number, string> = {
  400: 'Проверьте название, аудиофайл и обложку. Сервер не смог принять эти данные.',
  401: 'Сессия истекла. Войдите в аккаунт и повторите загрузку.',
  403: 'Загрузка запрещена. Обновите страницу и войдите в аккаунт снова.',
  409: 'Не удалось завершить загрузку из-за конфликта. Проверьте каталог перед повторной отправкой.',
  413: 'Файлы слишком большие. Аудио должно быть до 50 МиБ, обложка — до 10 МиБ.',
  415: 'Формат файла не поддерживается или файл повреждён. Выберите другое аудио или обложку.',
  429: 'Сервер занят или загрузки выполняются слишком часто. Подождите минуту и попробуйте снова.',
  502: 'Сервер загрузки недоступен. Попробуйте позже. Перед повторной отправкой проверьте каталог.',
  503: 'Загрузка временно недоступна. Попробуйте позже.',
  504: 'Время ожидания истекло. Проверьте каталог: трек мог загрузиться.',
}

export async function uploadTrack(body: FormData, signal: AbortSignal): Promise<string> {
  let response: Response
  try {
    response = await fetch('/api/tracks', {
      method: 'POST', body, signal, credentials: 'same-origin',
      headers: { 'X-Gurach-Request': '1' },
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('Соединение прервано. Проверьте интернет и каталог перед повторной загрузкой.')
  }
  if (!response.ok) {
    if (response.status === 409) {
      const payload = await readApiError(response)
      if (payload?.error.code === 'TRACK_DUPLICATE') {
        const id = payload.error.existingTrackId
        throw new DuplicateTrackError(typeof id === 'string' && /^[a-f\d]{24}$/i.test(id) ? id.toLowerCase() : undefined)
      }
    }
    throw new Error(UPLOAD_ERRORS[response.status] ?? 'Не удалось загрузить трек. Попробуйте позже.')
  }
  const track: unknown = await response.json().catch(() => null)
  if (!track || typeof track !== 'object' || !('_id' in track) || typeof track._id !== 'string' || !/^[a-f\d]{24}$/i.test(track._id)) {
    throw new Error('Сервер принял загрузку, но не вернул ссылку на трек. Проверьте каталог перед повторной отправкой.')
  }
  return track._id.toLowerCase()
}
