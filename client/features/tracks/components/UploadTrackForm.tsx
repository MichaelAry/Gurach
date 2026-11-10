'use client'

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Alert, Button, LinearProgress, Stack, TextField } from '@mui/material'
import { uploadTrack } from '../api/uploadTrack'
import { useRouter } from 'next/navigation'

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac']
const COVER_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif']

function validateFile(event: ChangeEvent<HTMLInputElement>, extensions: string[], maxMiB: number) {
  const input = event.currentTarget
  const file = input.files?.[0]
  let error = ''
  if (file) {
    const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? '' : ''
    if (!extensions.includes(extension)) error = `Поддерживаются форматы: ${extensions.join(', ')}.`
    else if (file.size === 0) error = 'Файл пуст. Выберите другой файл.'
    else if (file.size > maxMiB * 1024 * 1024) error = `Размер файла не должен превышать ${maxMiB} МиБ.`
  }
  input.setCustomValidity(error)
  return error
}

export function UploadTrackForm() {
  const router = useRouter()
  const [audioError, setAudioError] = useState('')
  const [coverError, setCoverError] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState(false)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => () => { requestRef.current?.abort() }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestRef.current || uploaded || !event.currentTarget.reportValidity()) return
    const body = new FormData(event.currentTarget)
    body.set('name', String(body.get('name') ?? '').trim())
    body.set('artist', String(body.get('artist') ?? '').trim())
    const controller = new AbortController()
    requestRef.current = controller
    setPending(true)
    setError(null)
    try {
      const trackId = await uploadTrack(body, controller.signal)
      if (!controller.signal.aborted) {
        setUploaded(true)
        router.push(`/tracks/${trackId}`)
        router.refresh()
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить трек.')
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        if (!controller.signal.aborted) setPending(false)
      }
    }
  }

  return (
    <Stack component="form" spacing={2.5} onSubmit={submit} aria-busy={pending}>
      <Stack component="fieldset" disabled={pending || uploaded} spacing={2.5} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
        <TextField
          label="Аудиофайл"
          name="audio"
          type="file"
          required
          error={Boolean(audioError)}
          helperText={audioError || 'MP3, WAV, OGG, OGA, M4A, FLAC, AAC — до 50 МиБ.'}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { accept: AUDIO_EXTENSIONS.map((extension) => `.${extension}`).join(',') },
          }}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setAudioError(validateFile(event, AUDIO_EXTENSIONS, 50))}
        />
        <TextField
          label="Обложка"
          name="picture"
          type="file"
          required
          error={Boolean(coverError)}
          helperText={coverError || 'JPG, JPEG, PNG, WebP, AVIF, GIF — до 10 МиБ.'}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { accept: COVER_EXTENSIONS.map((extension) => `.${extension}`).join(',') },
          }}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setCoverError(validateFile(event, COVER_EXTENSIONS, 10))}
        />
        <TextField
          label="Название трека"
          name="name"
          required
          slotProps={{ htmlInput: { maxLength: 200 } }}
          helperText="До 200 символов."
          onChange={(event) => event.target.setCustomValidity(event.target.value.trim() ? '' : 'Введите название трека.')}
        />
        <TextField
          label="Исполнитель"
          name="artist"
          slotProps={{ htmlInput: { maxLength: 200 } }}
          helperText="Необязательно, до 200 символов."
        />
        <TextField
          label="Текст песни"
          name="text"
          multiline
          minRows={4}
          maxRows={12}
          slotProps={{ htmlInput: { maxLength: 100_000 } }}
          helperText="Необязательно, до 100 000 символов."
        />
      </Stack>
      {pending && <LinearProgress aria-label="Загрузка трека" />}
      {error && <Alert severity="error">{error}</Alert>}
      {uploaded && <Alert severity="success">Трек успешно загружен. Открываем страницу трека…</Alert>}
      <Button type="submit" variant="contained" disabled={pending || uploaded}>{uploaded ? 'Трек загружен' : pending ? 'Загружаем…' : 'Загрузить трек'}</Button>
    </Stack>
  )
}
