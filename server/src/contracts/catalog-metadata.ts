import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_CATALOG_BYTES = 16 * 1024;
export const GENRE_SOURCES = ['musicbrainz', 'lastfm', 'theaudiodb', 'discogs'] as const;
export const GENRE_SCOPES = ['recording', 'release', 'artist'] as const;
export const ALBUM_SOURCES = ['manual', 'musicbrainz', 'discogs', 'theaudiodb'] as const;
export const PICTURE_SOURCES = ['manual', 'cover-art-archive'] as const;

export class ExternalIds {
  @ApiPropertyOptional() discogsReleaseId?: string;
  @ApiPropertyOptional() audioDbTrackId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) recordingMbid?: string;
  @ApiPropertyOptional({ format: 'uuid' }) releaseMbid?: string;
}
export class GenreEvidence {
  @ApiProperty() genre: string;
  @ApiProperty() rawTag: string;
  @ApiProperty({ enum: GENRE_SOURCES }) source: typeof GENRE_SOURCES[number];
  @ApiProperty({ enum: GENRE_SCOPES }) scope: typeof GENRE_SCOPES[number];
  @ApiProperty({ minimum: 0, maximum: 1 }) confidence: number;
}
export class CatalogProvenance {
  @ApiPropertyOptional({ enum: ALBUM_SOURCES }) albumSource?: typeof ALBUM_SOURCES[number];
  @ApiPropertyOptional({ enum: PICTURE_SOURCES }) pictureSource?: typeof PICTURE_SOURCES[number];
  @ApiPropertyOptional({ type: [GenreEvidence] }) genreEvidence?: GenreEvidence[];
  @ApiPropertyOptional({ type: [String] }) manualGenres?: string[];
}
export interface CatalogMetadata extends CatalogProvenance {
  album?: string;
  genres?: string[];
  externalIds?: ExternalIds;
}

function invalid(): never {
  throw new BadRequestException('Invalid catalog metadata');
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))) invalid();
  return value as Record<string, unknown>;
}
function string(value: unknown, limit: number, required = true): string {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) invalid();
  return value.trim();
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) invalid();
  return value as T;
}
export function genreKey(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
}
export function parseGenres(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 16) invalid();
  const genres = value.map((genre) => string(genre, 80));
  if (new Set(genres.map(genreKey)).size !== genres.length) invalid();
  return genres;
}
export function parseCatalogMetadata(raw: unknown): CatalogMetadata | undefined {
  if (raw === undefined) return;
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_CATALOG_BYTES) invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { invalid(); }
  const input = object(parsed, ['album', 'genres', 'externalIds', 'albumSource', 'pictureSource', 'genreEvidence', 'manualGenres']);
  const result: CatalogMetadata = {};
  if (input.album !== undefined) result.album = string(input.album, 200, false);
  if (input.genres !== undefined) result.genres = parseGenres(input.genres);
  if (input.externalIds !== undefined) {
    const ids = object(input.externalIds, ['recordingMbid', 'releaseMbid', 'discogsReleaseId', 'audioDbTrackId']);
    result.externalIds = {};
    for (const key of ['discogsReleaseId', 'audioDbTrackId'] as const) {
      if (ids[key] === undefined) continue;
      const id = string(ids[key], 12);
      if (!/^[1-9]\d*$/.test(id)) invalid();
      result.externalIds[key] = id;
    }
    for (const key of ['recordingMbid', 'releaseMbid'] as const) {
      if (ids[key] === undefined) continue;
      const id = string(ids[key], 36);
      if (!MBID.test(id)) invalid();
      result.externalIds[key] = id.toLowerCase();
    }
  }
  if (input.albumSource !== undefined) result.albumSource = oneOf(input.albumSource, ALBUM_SOURCES);
  if (input.pictureSource !== undefined) result.pictureSource = oneOf(input.pictureSource, PICTURE_SOURCES);
  const genres = result.genres ?? [];
  if (input.manualGenres !== undefined) result.manualGenres = parseGenres(input.manualGenres).filter((genre) => genres.includes(genre));
  if (input.genreEvidence !== undefined) {
    if (!Array.isArray(input.genreEvidence) || input.genreEvidence.length > 16) invalid();
    const seen = new Set<string>();
    result.genreEvidence = input.genreEvidence.map((entry): GenreEvidence => {
      const item = object(entry, ['genre', 'rawTag', 'source', 'scope', 'confidence']);
      const genre = string(item.genre, 80);
      if (seen.has(genreKey(genre))) invalid();
      seen.add(genreKey(genre));
      if (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) invalid();
      return { genre, rawTag: string(item.rawTag, 200), source: oneOf(item.source, GENRE_SOURCES),
        scope: oneOf(item.scope, GENRE_SCOPES), confidence: item.confidence };
    }).filter(({ genre }) => genres.includes(genre) && !result.manualGenres?.includes(genre));
  }
  if (result.albumSource === 'musicbrainz' && (!result.album || !result.externalIds?.releaseMbid)) invalid();
  if (result.albumSource === 'discogs' && (!result.album || !result.externalIds?.discogsReleaseId)) invalid();
  if (result.albumSource === 'theaudiodb' && (!result.album || !result.externalIds?.audioDbTrackId)) invalid();
  if (result.pictureSource === 'cover-art-archive' && !result.externalIds?.releaseMbid) invalid();
  return result;
}
