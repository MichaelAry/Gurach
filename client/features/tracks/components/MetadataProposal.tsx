'use client'

import { useState } from 'react'
import { Box, Button, Checkbox, Link, FormControlLabel, Stack, Typography } from '@mui/material'
import { useText } from '@/i18n/LocaleProvider'
import type { MetadataDetails } from '../catalogMetadata'
import { useObjectUrl } from '../hooks/useMetadataLookup'

export type ProposalField = 'name' | 'artist' | 'album' | 'genres' | 'picture'

export function MetadataProposal({ details, artwork, artworkStatus, dirty, onApply, onRetry }: {
  details: MetadataDetails
  artwork?: File
  artworkStatus?: 'loading' | 'missing' | 'unavailable'
  dirty: Partial<Record<ProposalField, boolean>>
  onApply: (fields: ProposalField[]) => void
  onRetry: () => void
}) {
  const lt = useText()
  const preview = useObjectUrl(artwork)
  const [choices, setChoices] = useState<Partial<Record<ProposalField, boolean>>>({})
  const available: { field: ProposalField; label: string; value: string | boolean | null }[] = [
    { field: 'name', label: lt('trackTitle'), value: details.name.length <= 200 ? details.name : null },
    { field: 'artist', label: lt('artist'), value: details.artist && details.artist.length <= 200 ? details.artist : null },
    { field: 'album', label: lt('metadataAlbum'), value: details.album && details.album.length <= 200 ? details.album : null },
    { field: 'genres', label: lt('metadataGenres'), value: details.genreEvidence.length > 0 },
    { field: 'picture', label: lt('cover'), value: !!artwork },
  ]
  const fields = available.filter(({ value }) => value)
  const isSelected = (field: ProposalField) => choices[field] ?? !dirty[field]
  const selected = fields.map(({ field }) => field).filter(isSelected)
  return (
    <Stack spacing={1} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
      <Typography variant="subtitle1">{details.name} — {details.artist}</Typography>
      <Typography variant="body2">{[details.version, details.album, details.edition ?? details.year, details.durationMs == null ? null
        : new Date(details.durationMs).toISOString().slice(11, 19)].filter(Boolean).join(' · ')}</Typography>
      <Typography variant="body2" color="text.secondary"><Link target="_blank" rel="noreferrer" href={`https://musicbrainz.org/recording/${details.recordingMbid}`}>{'MusicBrainz'}</Link>{preview && ' · Cover Art Archive'}</Typography>
      {details.sourceStatuses && Object.values(details.sourceStatuses).includes('unavailable')
        && <Typography role="status" variant="body2">{lt('metadataUnavailable')}</Typography>}
      {preview && <Box component="img" src={preview} alt={lt('coverPreview')} width={120} height={120} sx={{ objectFit: 'contain' }} />}
      {artworkStatus === 'missing' && <Typography variant="body2" role="status">{lt('metadataNoCover')}</Typography>}
      {artworkStatus === 'loading' && <Typography variant="body2" role="status">{lt('metadataLoadingCover')}</Typography>}
      {artworkStatus === 'unavailable' && <Button type="button" onClick={onRetry}>{lt('metadataRetryCover')}</Button>}
      <Stack>
        {fields.map(({ field, label, value }) => (
          <FormControlLabel key={field} label={typeof value === 'string' ? `${label} · ${value}` : label}
            control={<Checkbox checked={isSelected(field)} onChange={(_, checked) => setChoices({ ...choices, [field]: checked })} />} />
        ))}
      </Stack>
      {!!details.genreEvidence.length && <Box component="ul" sx={{ my: 0, pl: 3 }}>
        {details.genreEvidence.map(({ genre, rawTag, source, scope }) => <li key={genre}>
          {genre} · {source === 'musicbrainz' ? 'MusicBrainz' : <Link target="_blank" rel="noreferrer" href="https://www.last.fm/">{'Last.fm'}</Link>} · {lt(scope === 'recording' ? 'metadataGenreRecording' : scope === 'release' ? 'metadataGenreRelease' : 'metadataGenreArtist')}{rawTag !== genre && ` · ${rawTag}`}
        </li>)}
      </Box>}
      <Button type="button" variant="outlined" disabled={!selected.length} onClick={() => onApply(selected)}>{lt('metadataApply')}</Button>
    </Stack>
  )
}
