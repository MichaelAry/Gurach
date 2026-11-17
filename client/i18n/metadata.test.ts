import { describe, expect, it } from 'vitest'
import { localizedMetadata, type MetadataMessages } from './metadata'

describe('localized metadata', () => {
  it('uses the same translations for initial HTML and a later locale change', () => {
    const messages: MetadataMessages = {
      title: { key: 'tracks' }, description: { key: 'browseAndSearchTracksByTitleOrArtist' },
    }
    const metadata = localizedMetadata('en', messages)
    expect(metadata.title).toBe('Tracks')
    expect(metadata.description).toBe('Browse and search tracks by title or artist')
    expect(localizedMetadata('ru', messages)).toEqual({
      title: 'Треки', description: 'Каталог и поиск треков по названию или исполнителю', openGraphDescription: 'Музыкальный плеер',
    })
  })

  it('preserves user content and translates parameterized track descriptions', () => {
    const messages: MetadataMessages = {
      title: 'Track {name} — Artist',
      openGraphDescription: { key: 'artistDescription', values: { name: 'Track {artist}', artist: 'Artist' } },
    }
    const metadata = localizedMetadata('en', messages)
    expect(metadata.title).toBe('Track {name} — Artist')
    expect(metadata.openGraphDescription).toBe('Track {artist} by Artist')
    expect(localizedMetadata('ru', messages).title).toBe(metadata.title)
    expect(localizedMetadata('ru', messages).openGraphDescription).toBe('Track {artist} — Artist')
  })
})
