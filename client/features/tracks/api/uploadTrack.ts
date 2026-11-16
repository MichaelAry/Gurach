import { readApiError } from '@/lib/api/error'

export class UploadJobFailedError extends Error {}

export class DuplicateTrackError extends Error {
  constructor(readonly existingTrackId?: string, readonly duplicateReason: string = 'identity') {
    const explanations: Record<string, string> = {
      identity: 'Активный трек с таким названием и исполнителем уже существует.',
      file_sha256: 'Этот аудиофайл побайтово совпадает с файлом существующего трека.',
      decoded_audio_sha256: 'Аудиосэмплы и каналы совпадают с существующим треком, даже если теги или формат файла отличаются.',
      chromaprint: 'Длительность и аудиоотпечатки почти всей записи совпадают с существующим треком. Возможно, это перекодированная копия.',
    }
    super(explanations[duplicateReason] ?? 'Сервер обнаружил дубликат существующего трека.')
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

export async function uploadTrack(body: FormData, signal: AbortSignal, background = false, onProgress?: (message: string) => void, onAccepted?: (operationId: string) => void): Promise<string> {
  let response: Response
  try {
    response = await fetch('/api/tracks', {
      method: 'POST', body, signal, credentials: 'same-origin',
      headers: { 'X-Gurach-Request': '1', ...(background ? { 'X-Gurach-Upload-Mode': 'background' } : {}) },
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
        throw new DuplicateTrackError(typeof id === 'string' && /^[a-f\d]{24}$/i.test(id) ? id.toLowerCase() : undefined, payload.error.duplicateReason)
      }
    }
    throw new Error(UPLOAD_ERRORS[response.status] ?? 'Не удалось загрузить трек. Попробуйте позже.')
  }
  if (response.status === 202) {
    const job = await response.json()
    if (!/^[a-f0-9-]{36}$/i.test(job?.operationId)) throw new Error('Сервер не вернул номер задания.')
    onAccepted?.(job.operationId)
    return waitForUpload(job.operationId, signal, onProgress)
  }
  const track: unknown = await response.json().catch(() => null)
  if (!track || typeof track !== 'object' || !('_id' in track) || typeof track._id !== 'string' || !/^[a-f\d]{24}$/i.test(track._id)) {
    throw new Error('Сервер принял загрузку, но не вернул ссылку на трек. Проверьте каталог перед повторной отправкой.')
  }
  return track._id.toLowerCase()
}

/** Polls the durable job only. Never resubmits the multipart upload. */
export async function waitForUpload(operationId: string, signal: AbortSignal, onProgress?: (message: string) => void): Promise<string> {
  onProgress?.(`Файлы приняты. Обработка в фоне: ${operationId}`)
  const deadline = Date.now() + 15 * 60_000
  while (!signal.aborted && Date.now() < deadline) {
    const response = await fetch(`/api/tracks/uploads/${encodeURIComponent(operationId)}`, { signal, credentials: 'same-origin', cache: 'no-store' })
    if (response.status === 404) throw new UploadJobFailedError(`Задание ${operationId} недоступно.`)
    if (!response.ok) throw new Error(`Не удалось получить состояние задания ${operationId}. Фоновая обработка продолжается.`)
    const job = await response.json()
    if (job.status === 'published' && /^[a-f\d]{24}$/i.test(job.trackId)) return job.trackId.toLowerCase()
    if (job.status === 'failed' && job.errorCode === 'TRACK_DUPLICATE') {
      throw new DuplicateTrackError(typeof job.existingTrackId === 'string' && /^[a-f\d]{24}$/i.test(job.existingTrackId) ? job.existingTrackId : undefined, job.duplicateReason)
    }
    if (job.status === 'failed') throw new UploadJobFailedError(`Обработка завершилась ошибкой (${job.errorCode ?? 'media_failed'}). Проверьте каталог перед новой загрузкой.`)
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(signal.reason) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, 2000)
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
    })
  }
  signal.throwIfAborted()
  throw new Error(`Задание ${operationId} продолжает выполняться. Проверьте каталог позже.`)
}
