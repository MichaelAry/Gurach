'use client'
import { useText, useMessage } from '@/i18n/LocaleProvider'
import { message as localMessage } from '@/i18n/messages'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import { useRouter } from 'next/navigation'
import { getEditableTrack, updateTrack, type TrackMetadataUpdate } from '@/features/tracks/api/updateTrack'
import type { TrackDetail } from '@/features/tracks/types'

export function TrackMetadataEditor({ id, onClose, onSaved }: {
  id: string
  onClose: () => void
  onSaved: (track: TrackDetail) => void
}) {
  const resolve = useMessage()

  const lt = useText()

  const router = useRouter()
  const [fields, setFields] = useState<TrackMetadataUpdate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const request = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getEditableTrack(id, controller.signal).then((track) => {
      if (!controller.signal.aborted) setFields({ name: track.name, artist: track.artist ?? '', text: track.lyrics ?? '' })
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : localMessage('couldNotLoadTheTrack'))
    })
    return () => controller.abort()
  }, [id, attempt])
  useEffect(() => () => request.current?.abort(), [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!fields || request.current || !event.currentTarget.reportValidity()) return
    const controller = new AbortController()
    request.current = controller
    setSaving(true)
    setError(null)
    try {
      const track = await updateTrack(id, { ...fields, name: fields.name?.trim(), artist: fields.artist?.trim() }, controller.signal)
      if (!controller.signal.aborted) {
        onSaved(track)
        router.refresh()
        onClose()
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : localMessage('couldNotSaveChangesTryAgain'))
    } finally {
      if (request.current === controller) {
        request.current = null
        if (!controller.signal.aborted) setSaving(false)
      }
    }
  }

  return (
    <Dialog open onClose={() => { if (!saving) onClose() }} fullWidth maxWidth="sm" aria-labelledby="track-editor-title">
      <form onSubmit={save} aria-busy={saving || (!fields && !error)}>
        <DialogTitle id="track-editor-title">{lt('editTrack100')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {!fields && !error && <Typography role="status">{lt('loadingTrackDetails')}</Typography>}
            {error && <Alert severity="error" action={!fields ? <Button onClick={() => { setError(null); setAttempt((value) => value + 1) }}>{lt('tryAgain')}</Button> : undefined}>{resolve(error)}</Alert>}
            {fields && <>
              <TextField label={lt('trackTitle')} required value={fields.name} disabled={saving}
                slotProps={{ htmlInput: { maxLength: 200 } }}
                onChange={(event) => {
                  const error = event.target.value.trim() ? '' : localMessage('enterATrackTitle')
                  event.target.dataset.gurachValidationMessage = error
                  event.target.setCustomValidity(resolve(error))
                  setFields({ ...fields, name: event.target.value })
                }} />
              <TextField label={lt('artist')} value={fields.artist} disabled={saving}
                slotProps={{ htmlInput: { maxLength: 200 } }}
                onChange={(event) => setFields({ ...fields, artist: event.target.value })} />
              <TextField label={lt('lyrics105')} value={fields.text} disabled={saving} multiline minRows={4} maxRows={12}
                slotProps={{ htmlInput: { maxLength: 100_000 } }}
                onChange={(event) => setFields({ ...fields, text: event.target.value })} />
            </>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>{lt('cancel')}</Button>
          <Button type="submit" variant="contained" disabled={!fields || saving}>{saving ? lt('saving') : lt('save')}</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
