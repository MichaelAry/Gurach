'use client'
import { useText, useMessage } from '@/i18n/LocaleProvider'
import { message as localMessage } from '@/i18n/messages'

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Alert, Button, LinearProgress, Stack, TextField } from '@mui/material'
import Link from 'next/link'
import { UploadFileField } from './UploadFileField'
import { DuplicateTrackError, UploadJobFailedError, uploadTrack, waitForUpload } from '../api/uploadTrack'
import { useRouter } from 'next/navigation'
import { useViewer } from '@/features/auth/ViewerProvider'

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac']
const COVER_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif']

function validateFile(event: ChangeEvent<HTMLInputElement>, extensions: string[], maxMiB: number, resolve: ReturnType<typeof useMessage>) {
  const input = event.currentTarget
  const file = input.files?.[0]
  let error = ''
  if (file) {
    const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? '' : ''
    if (!extensions.includes(extension)) error = localMessage('supportedFormats', { p0: extensions.join(', ') })
    else if (file.size === 0) error = localMessage('theFileIsEmptyChooseAnotherFile')
    else if (file.size > maxMiB * 1024 * 1024) error = localMessage('theFileMustBeNoLargerThanMib', { p0: maxMiB })
  }
  input.dataset.gurachValidationMessage = error
  input.setCustomValidity(resolve(error))
  return error
}

export function UploadTrackForm() {
  const resolve = useMessage()

  const lt = useText()

  const { user, confirmed, isConfirmed } = useViewer()
  const router = useRouter()
  const [audioError, setAudioError] = useState('')
  const [coverError, setCoverError] = useState('')
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [existingTrackId, setExistingTrackId] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState(false)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => () => { requestRef.current?.abort() }, [])

  useEffect(() => {
    if (!confirmed || !user) return
    const saved = sessionStorage.getItem(`gurach-upload:${user.id}`)
    if (!saved || !/^[a-f0-9-]{36}$/i.test(saved) || requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return
      setPending(true)
      try {
        const trackId = await waitForUpload(saved, controller.signal, setProgress)
        sessionStorage.removeItem(`gurach-upload:${user.id}`)
        setUploaded(true)
        router.push(`/tracks/${trackId}`)
        router.refresh()
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : localMessage('couldNotCheckProcessingStatus'))
          if (cause instanceof UploadJobFailedError || cause instanceof DuplicateTrackError) sessionStorage.removeItem(`gurach-upload:${user.id}`)
          setExistingTrackId(cause instanceof DuplicateTrackError ? cause.existingTrackId ?? null : null)
        }
      } finally {
        if (requestRef.current === controller) requestRef.current = null
        if (!controller.signal.aborted) setPending(false)
      }
    })
    return () => { controller.abort(); if (requestRef.current === controller) requestRef.current = null }
  }, [confirmed, user, router])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !isConfirmed(user.id) || requestRef.current || uploaded) return
    const saved = sessionStorage.getItem(`gurach-upload:${user.id}`)
    if (!saved && !event.currentTarget.reportValidity()) return
    const body = new FormData(event.currentTarget)
    body.set('name', String(body.get('name') ?? '').trim())
    body.set('artist', String(body.get('artist') ?? '').trim())
    const controller = new AbortController()
    requestRef.current = controller
    setPending(true)
    setError(null)
    setExistingTrackId(null)
    try {
      const trackId = saved && /^[a-f0-9-]{36}$/i.test(saved)
        ? await waitForUpload(saved, controller.signal, setProgress)
        : await uploadTrack(body, controller.signal, true, setProgress, (operationId) => { sessionStorage.setItem(`gurach-upload:${user.id}`, operationId) })
      if (!controller.signal.aborted) {
        sessionStorage.removeItem(`gurach-upload:${user.id}`)
        setUploaded(true)
        router.push(`/tracks/${trackId}`)
        router.refresh()
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof UploadJobFailedError || cause instanceof DuplicateTrackError) sessionStorage.removeItem(`gurach-upload:${user.id}`)
        setError(cause instanceof Error ? cause.message : localMessage('couldNotLoadTheTrack'))
        setExistingTrackId(cause instanceof DuplicateTrackError ? cause.existingTrackId ?? null : null)
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        if (!controller.signal.aborted) setPending(false)
      }
    }
  }

  return (
    <Stack component="form" noValidate spacing={2.5} onSubmit={submit} aria-busy={pending} sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 'var(--wae-radius-panel)', p: { xs: 2.5, md: 4 } }}>
      <Stack component="fieldset" disabled={!confirmed || pending || uploaded} spacing={2.5} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
        <UploadFileField label={lt('audioFile')} name="audio"
          accept={AUDIO_EXTENSIONS.map(extension => `.${extension}`).join(',')}
          error={Boolean(audioError)} helperText={resolve(audioError) || lt('mpWavOggOgaMAFlacAacUp')}
          disabled={!confirmed || pending || uploaded}
          onChange={event => setAudioError(validateFile(event, AUDIO_EXTENSIONS, 50, resolve))} />
        <UploadFileField label={lt('cover')} name="picture"
          accept={COVER_EXTENSIONS.map(extension => `.${extension}`).join(',')}
          error={Boolean(coverError)} helperText={resolve(coverError) || lt('jpgJpegPngWebpAvifGifUpToMib')}
          disabled={!confirmed || pending || uploaded}
          onChange={event => setCoverError(validateFile(event, COVER_EXTENSIONS, 10, resolve))} />
        <TextField
          label={lt('trackTitle')}
          name="name"
          required
          slotProps={{ htmlInput: { maxLength: 200 } }}
          helperText={lt('upToCharacters')}
          onChange={(event) => {
            const error = event.target.value.trim() ? '' : localMessage('enterATrackTitle')
            event.target.dataset.gurachValidationMessage = error
            event.target.setCustomValidity(resolve(error))
          }}
        />
        <TextField
          label={lt('artist')}
          name="artist"
          slotProps={{ htmlInput: { maxLength: 200 } }}
          helperText={lt('optionalUpToCharacters')}
        />
        <TextField
          label={lt('lyrics105')}
          name="text"
          multiline
          minRows={4}
          maxRows={12}
          slotProps={{ htmlInput: { maxLength: 100_000 } }}
          helperText={lt('optionalUpToCharacters354')}
        />
      </Stack>
      {pending && <LinearProgress aria-label={lt('uploadingTrack')} />}
      {progress && <Alert severity="info">{resolve(progress)}</Alert>}
      {error && <Alert severity="error">{resolve(error)}{existingTrackId && <> <Link href={`/tracks/${existingTrackId}`}>{lt('openExistingTrack')}</Link></>}</Alert>}
      {uploaded && <Alert severity="success">{lt('trackUploadedOpeningTheTrackPage')}</Alert>}
      <Button type="submit" variant="contained" disabled={!confirmed || pending || uploaded}>{uploaded ? lt('trackUploaded') : pending ? lt('loading') : lt('uploadTrack')}</Button>
    </Stack>
  )
}
