'use client'
import { useText, useMessage, useLocale } from '@/i18n/LocaleProvider'
import { message as localMessage } from '@/i18n/messages'

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Alert, Box, Button, Checkbox, FormControlLabel, LinearProgress, Stack, TextField, Typography } from '@mui/material'
import Link from 'next/link'
import { useDuration, useMetadataLookup, useObjectUrl } from '../hooks/useMetadataLookup'
import { parseGenreInput, validGenres, type GenreEvidence, type MetadataDetails } from '../catalogMetadata'
import { MetadataProposal, type ProposalField } from './MetadataProposal'
import { UploadFileField } from './UploadFileField'
import { DuplicateTrackError, UploadJobFailedError, uploadTrack, waitForUpload } from '../api/uploadTrack'
import { useRouter } from 'next/navigation'
import { useViewer } from '@/features/auth/ViewerProvider'

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac']
const COVER_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif']

function normalizeIdentity(value: string) {
  return value.normalize('NFC').trim().toLowerCase().replace(/\s+/gu, ' ')
}

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
  const { locale } = useLocale()

  const { user, confirmed, isConfirmed } = useViewer()
  const router = useRouter()
  const [audioError, setAudioError] = useState('')
  const [coverError, setCoverError] = useState('')
  const [pending, setPending] = useState(false)
  const [stage, setStage] = useState<'idle' | 'sending' | 'processing' | 'ready'>('idle')
  const [audioBytes, setAudioBytes] = useState<number | null>(null)
  const [audio, setAudio] = useState<File | null>(null)
  const [localCover, setLocalCover] = useState<File | null>(null)
  const [coverInputKey, setCoverInputKey] = useState(0)
  const [enabled, setEnabled] = useState(true)
  const [name, setName] = useState('')
  const [artist, setArtist] = useState('')
  const [album, setAlbum] = useState('')
  const [genres, setGenres] = useState('')
  const [dirty, setDirty] = useState<Partial<Record<ProposalField, boolean>>>({})
  const [albumSource, setAlbumSource] = useState<'manual' | 'musicbrainz' | 'theaudiodb' | 'discogs'>('manual')
  const [evidence, setEvidence] = useState<GenreEvidence[]>([])
  const [appliedCover, setAppliedCover] = useState<File>()
  const [sources, setSources] = useState({ musicbrainz: true, theaudiodb: false, discogs: false })
  const [lastfm, setLastfm] = useState(false)
  const [ids, setIds] = useState<{ discogsReleaseId?: string; audioDbTrackId?: string; recordingMbid?: string; releaseMbid?: string }>()
  const [applied, setApplied] = useState(false)
  const coverPreview = useObjectUrl(localCover || appliedCover)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingTrackId, setExistingTrackId] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState(false)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => () => { requestRef.current?.abort() }, [])
  const editable = confirmed && !!user && !pending && !uploaded && stage === 'idle'
  const duration = useDuration(enabled && editable ? audio : null)
  const inputs = { name, artist, audio, duration }
  const musicbrainz = useMetadataLookup({ ...inputs, active: editable && enabled && sources.musicbrainz, source: 'musicbrainz', lastfm })
  const theaudiodb = useMetadataLookup({ ...inputs, active: editable && enabled && sources.theaudiodb, source: 'theaudiodb' })
  const discogs = useMetadataLookup({ ...inputs, active: editable && enabled && sources.discogs, source: 'discogs' })
  const catalogs = { musicbrainz, theaudiodb, discogs }
  const labels = { musicbrainz: 'MusicBrainz', theaudiodb: 'TheAudioDB', discogs: 'Discogs' }
  const keys = Object.keys(labels) as (keyof typeof labels)[]
  const selectedSources = keys.filter(key => sources[key])
  function invalidate() {
    for (const catalog of Object.values(catalogs)) catalog.invalidate()
  }

  function editIdentity(field: 'name' | 'artist', value: string) {
    invalidate()
    setApplied(false)
    setDirty((fields) => ({ ...fields, [field]: true }))
    if (field === 'name') setName(value)
    else setArtist(value)
    if (normalizeIdentity(value) === normalizeIdentity(field === 'name' ? name : artist)) return
    if (albumSource !== 'manual') setAlbum('')
    setAlbumSource('manual')
    if (evidence.length) setGenres(parseGenreInput(genres).filter((genre) => !evidence.some((entry) => entry.genre === genre)).join('\n'))
    setEvidence([])
    setAppliedCover(undefined)
    setPreviewFailed(false)
    setIds(undefined)
  }

  function apply(fields: ProposalField[], details: MetadataDetails, artwork?: File) {
    const source = details.sources.includes('discogs') ? 'discogs'
      : details.sources.includes('theaudiodb') ? 'theaudiodb' : 'musicbrainz'
    const selectedIds = source === 'discogs' ? { discogsReleaseId: details.catalogId }
      : source === 'theaudiodb' ? { audioDbTrackId: details.catalogId }
      : { recordingMbid: details.recordingMbid, releaseMbid: details.releaseMbid ?? undefined }
    const changedRelease = (Object.keys(selectedIds) as (keyof NonNullable<typeof ids>)[])
      .some(key => ids?.[key] !== undefined && ids[key] !== selectedIds[key])
    const nextName = fields.includes('name') ? details.name : name
    const nextArtist = fields.includes('artist') ? details.artist ?? '' : artist
    const changedIdentity = normalizeIdentity(nextName) !== normalizeIdentity(name) ||
      normalizeIdentity(nextArtist) !== normalizeIdentity(artist)
    if (nextName !== name || nextArtist !== artist) invalidate()
    if (fields.includes('name')) setName(details.name)
    if (fields.includes('artist')) setArtist(details.artist ?? '')
    if (fields.includes('album')) {
      setAlbum(details.album ?? '')
      setAlbumSource(source)
    } else if (albumSource !== 'manual' && (changedIdentity || (changedRelease && albumSource === source))) {
      setAlbum('')
      setAlbumSource('manual')
    }
    if (fields.includes('genres')) {
      setGenres(details.genreEvidence.map(({ genre }) => genre).join('\n'))
      setEvidence(details.genreEvidence)
    } else if (changedIdentity || changedRelease) {
      const obsolete = (entry: GenreEvidence) => changedIdentity || entry.source === source ||
        (source === 'musicbrainz' && entry.source === 'lastfm')
      setGenres(parseGenreInput(genres).filter(genre => !evidence.some(entry => entry.genre === genre && obsolete(entry))).join('\n'))
      setEvidence(evidence.filter(entry => !obsolete(entry)))
    }
    if (fields.includes('picture') && artwork) {
      setAppliedCover(artwork)
      setLocalCover(null)
      setCoverError('')
      setCoverInputKey((key) => key + 1)
      setPreviewFailed(false)
    } else if (changedIdentity || (changedRelease && source === 'musicbrainz')) {
      setAppliedCover(undefined)
      setPreviewFailed(false)
    }
    setDirty((previous) => Object.fromEntries(Object.entries(previous).filter(([field]) => !fields.includes(field as ProposalField))))
    setIds(changedIdentity ? selectedIds : { ...ids, ...selectedIds })
    setApplied(true)
  }

  useEffect(() => {
    if (!confirmed || !user) return
    const saved = sessionStorage.getItem(`gurach-upload:${user.id}`)
    if (!saved || !/^[a-f0-9-]{36}$/i.test(saved) || requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return
      setPending(true)
      setStage('processing')
      setError(null)
      try {
        const trackId = await waitForUpload(saved, controller.signal)
        if (controller.signal.aborted) return
        sessionStorage.removeItem(`gurach-upload:${user.id}`)
        setStage('ready')
        setUploaded(true)
        router.push(`/tracks/${trackId}`)
        router.refresh()
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : localMessage('couldNotCheckProcessingStatus'))
          if (cause instanceof UploadJobFailedError || cause instanceof DuplicateTrackError) {
            sessionStorage.removeItem(`gurach-upload:${user.id}`)
            setStage('idle')
          }
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
    const genreValues = parseGenreInput(genres)
    if (!saved && !validGenres(genreValues)) return
    invalidate()
    const body = new FormData(event.currentTarget)
    if (!localCover && appliedCover) body.set('picture', appliedCover, appliedCover.name)
    body.set('catalogMetadata', JSON.stringify({
      album: album.trim(), genres: genreValues, externalIds: ids,
      albumSource,
      pictureSource: !localCover && appliedCover ? 'cover-art-archive' : 'manual',
      genreEvidence: evidence.filter(({ genre }) => genreValues.includes(genre)),
    }))
    body.set('name', String(body.get('name') ?? '').trim())
    body.set('artist', String(body.get('artist') ?? '').trim())
    const controller = new AbortController()
    requestRef.current = controller
    setPending(true)
    setStage(saved ? 'processing' : 'sending')
    setError(null)
    setExistingTrackId(null)
    try {
      const trackId = saved && /^[a-f0-9-]{36}$/i.test(saved)
        ? await waitForUpload(saved, controller.signal)
        : await uploadTrack(body, controller.signal, true, undefined, (operationId) => {
          sessionStorage.setItem(`gurach-upload:${user.id}`, operationId)
          if (!controller.signal.aborted) setStage('processing')
        })
      if (!controller.signal.aborted) {
        sessionStorage.removeItem(`gurach-upload:${user.id}`)
        setStage('ready')
        setUploaded(true)
        router.push(`/tracks/${trackId}`)
        router.refresh()
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof UploadJobFailedError || cause instanceof DuplicateTrackError) {
          sessionStorage.removeItem(`gurach-upload:${user.id}`)
          setStage('idle')
        } else if (!sessionStorage.getItem(`gurach-upload:${user.id}`)) setStage('idle')
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
      <Stack component="fieldset" disabled={!editable} spacing={2.5} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
        <UploadFileField label={lt('audioFile')} name="audio"
          accept={AUDIO_EXTENSIONS.map(extension => `.${extension}`).join(',')}
          error={Boolean(audioError)} helperText={resolve(audioError) || lt('mpWavOggOgaMAFlacAacUp')}
          disabled={!editable}
          onChange={event => {
            setAudioError(validateFile(event, AUDIO_EXTENSIONS, 50, resolve))
            invalidate()
            const file = event.currentTarget.files?.[0] ?? null
            setAudio(file)
            setAudioBytes(file?.size ?? null)
          }} />
        {audioBytes !== null && <Typography variant="body2" color="text.secondary">
          {audioBytes >= 1024 * 1024
            ? lt('selectedAudioSizeMiB', { size: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(audioBytes / (1024 * 1024)) })
            : lt('selectedAudioSizeBytes', { size: new Intl.NumberFormat(locale).format(audioBytes) })}
        </Typography>}
        <UploadFileField key={coverInputKey} label={lt('cover')} name="picture"
          required={!appliedCover} appliedFilename={appliedCover?.name}
          onClear={() => { setLocalCover(null); setCoverError(''); setPreviewFailed(false) }}
          accept={COVER_EXTENSIONS.map(extension => `.${extension}`).join(',')}
          error={Boolean(coverError)} helperText={resolve(coverError) || lt('jpgJpegPngWebpAvifGifUpToMib')}
          disabled={!editable}
          onChange={event => {
            const error = validateFile(event, COVER_EXTENSIONS, 10, resolve)
            setCoverError(error)
            setPreviewFailed(false)
            const file = event.currentTarget.files?.[0]
            setLocalCover(file ?? null)
            setDirty((fields) => ({ ...fields, picture: true }))
          }} />
        {appliedCover && !localCover && <Button type="button" onClick={() => {
          setAppliedCover(undefined)
          setPreviewFailed(false)
          setDirty((fields) => ({ ...fields, picture: true }))
        }}>{lt('metadataRemoveCover')}</Button>}
        {coverPreview && !coverError && (previewFailed
          ? <Typography variant="body2" color="text.secondary">{lt('coverPreviewUnavailable')}</Typography>
          : <Box component="img" src={coverPreview} alt={lt('coverPreview')} width={160} height={160}
              decoding="async" onError={() => setPreviewFailed(true)}
              sx={{ width: 160, height: 160, objectFit: 'contain', bgcolor: 'action.hover', borderRadius: 'var(--wae-radius-artwork)' }} />)}
        <TextField
          label={lt('trackTitle')}
          name="name"
          value={name}
          required
          slotProps={{ htmlInput: { maxLength: 200 } }}
          helperText={lt('upToCharacters')}
          onChange={(event) => {
            editIdentity('name', event.target.value)
            const error = event.target.value.trim() ? '' : localMessage('enterATrackTitle')
            event.target.dataset.gurachValidationMessage = error
            event.target.setCustomValidity(resolve(error))
          }}
        />
        <TextField
          label={lt('artist')}
          name="artist"
          value={artist}
          onChange={(event) => editIdentity('artist', event.target.value)}
          slotProps={{ htmlInput: { maxLength: 200 } }}
          helperText={lt('optionalUpToCharacters')}
        />
        <FormControlLabel label={lt('metadataEnabled')} control={<Checkbox checked={enabled} onChange={(_, checked) => {
          invalidate()
          setEnabled(checked)
        }} />} />
        {enabled && <>
          {keys.map(key => <FormControlLabel key={key} label={labels[key]} control={<Checkbox checked={sources[key]} onChange={(_, checked) => {
            catalogs[key].invalidate()
            setSources(previous => ({ ...previous, [key]: checked }))
          }} />} />)}
          {sources.musicbrainz && <FormControlLabel label="Last.fm" control={<Checkbox checked={lastfm} onChange={(_, checked) => {
            musicbrainz.invalidate()
            setLastfm(checked)
          }} />} />}
          {name.trim() && selectedSources.length > 0 && !artist.trim() && <Button type="button" onClick={() => { selectedSources.forEach(key => void catalogs[key].search()) }}>{lt('metadataTitleSearch')}</Button>}
          {selectedSources.map(key => {
            const metadata = catalogs[key]
            const results = metadata.state.status === 'results' ? metadata.state : undefined
            return <Stack key={key} role="group" aria-label={labels[key]}>
              {selectedSources.length > 1 && <Typography variant="subtitle2">{labels[key]}</Typography>}
              <Typography role={editable ? 'status' : undefined} variant="body2">
                {metadata.state.status === 'searching' ? lt('metadataSearching')
                  : metadata.state.status === 'empty' ? lt('metadataEmpty')
                  : results?.detailError === 'mismatch' ? lt('metadataMismatch')
                  : metadata.state.status === 'unavailable' || results?.detailError ? lt('metadataUnavailable')
                  : results && results.selected === null ? lt('metadataChooseRelease')
                  : results?.selected != null && !results.details ? lt('metadataSearching') : null}
              </Typography>
              {metadata.state.status === 'unavailable' && <Button type="button" onClick={() => { void metadata.search() }}>{lt('tryAgain')}</Button>}
              {results && <Stack spacing={0.5}>
                {results.candidates.map((candidate, index) => (
                  <Button key={`${candidate.catalogId ?? candidate.recordingMbid}:${candidate.releaseMbid}`} type="button"
                    variant={results.selected === index ? 'outlined' : 'text'} aria-pressed={results.selected === index}
                    onClick={() => { void metadata.select(results.candidates, index) }}>
                    {[labels[key], candidate.name, candidate.artist, candidate.version, candidate.album, candidate.edition ?? candidate.year].filter(Boolean).join(' · ')}
                  </Button>
                ))}
              </Stack>}
              {results?.details && <MetadataProposal key={`${results.details.catalogId ?? results.details.recordingMbid}:${results.details.releaseMbid}`}
                details={results.details} artwork={results.artwork} artworkStatus={results.artworkStatus}
                dirty={dirty} onApply={fields => apply(fields, results.details!, results.artwork)} onRetry={() => {
                  if (results.selected != null) void metadata.select(results.candidates, results.selected)
                }} />}
            </Stack>
          })}
        </>}
        {applied && editable && <Typography role="status" variant="body2">{lt('metadataApplied')}</Typography>}
        <TextField label={lt('metadataAlbum')} value={album} slotProps={{ htmlInput: { maxLength: 200 } }}
          onChange={(event) => {
            setAlbum(event.target.value)
            setAlbumSource('manual')
            setDirty((fields) => ({ ...fields, album: true }))
          }} />
        <TextField label={lt('metadataGenres')} value={genres} multiline minRows={2} maxRows={6}
          error={!validGenres(parseGenreInput(genres))} helperText={lt('metadataGenreHelp')}
          onChange={(event) => {
            setGenres(event.target.value)
            const values = parseGenreInput(event.target.value)
            setEvidence((previous) => previous.filter(({ genre }) => values.includes(genre)))
            setDirty((fields) => ({ ...fields, genres: true }))
          }} />
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
      {pending && <Typography role="status">{lt(stage === 'processing' ? 'uploadStageProcessing' : 'uploadStageSending')}</Typography>}
      {!uploaded && <Alert severity="info">{lt(stage === 'processing' ? 'uploadBackgroundHint' : 'uploadSendingHint')}</Alert>}
      {error && <Alert severity="error">{resolve(error)}{existingTrackId && <> <Link href={`/tracks/${existingTrackId}`}>{lt('openExistingTrack')}</Link></>}</Alert>}
      {uploaded && <Alert severity="success" role="status">{lt('trackUploadedOpeningTheTrackPage')}</Alert>}
      <Button type="submit" variant="contained" disabled={!confirmed || pending || uploaded || (stage === 'idle' && !validGenres(parseGenreInput(genres)))}>{uploaded ? lt('trackUploaded') : pending ? lt('loading') : stage === 'processing' ? lt('checkUploadStatus') : lt('uploadTrack')}</Button>
    </Stack>
  )
}
