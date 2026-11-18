import type { components } from '@/lib/api/schema'

export type MetadataCandidate = components['schemas']['MetadataCandidate']
export type MetadataSearch = components['schemas']['MetadataSearchResponse']
export type MetadataDetails = components['schemas']['MetadataDetailsResponse']
export type GenreEvidence = components['schemas']['GenreEvidence']

export const COVER_EXTENSIONS_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
}
export const MAX_COVER_BYTES = 10 * 1024 * 1024

export function parseGenreInput(value: string): string[] {
  return value.split(/\n/u).map((genre) => genre.trim()).filter(Boolean)
}

export function validGenres(genres: string[]): boolean {
  return genres.length <= 16 && genres.every((genre) => genre.length <= 80)
    && new Set(genres.map((genre) => genre.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' '))).size === genres.length
}
