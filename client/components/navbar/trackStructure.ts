import type { Section, TrackItem } from './types'

export function buildTrackStructure(sections: Section[]): TrackItem[] {
  const result: TrackItem[] = []
  let id = 1

  for (const section of sections) {
    result.push({
      id: id++,
      isAnchor: true,
      label: section.label,
      href: section.href,
    })
    for (let i = 0; i < section.trackCount; i++) {
      result.push({ id: id++, isAnchor: false })
    }
  }

  return result
}

export const trackStructure: TrackItem[] = buildTrackStructure([
  { label: 'Main', href: '/', trackCount: 14 },
  { label: 'All tracks', href: '/tracks', trackCount: 20 },
  // сюда добавляешь новые секции одной строкой:
  // { label: 'Favorites', href: '#favorites', trackCount: 8 },
])
