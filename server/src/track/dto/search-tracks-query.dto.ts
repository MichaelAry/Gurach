import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { decodeScopedCursor } from '../../common/cursor.js';
import { parseCursorPageQuery } from './list-tracks-query.dto.js';

export interface SearchParams {
  query?: string;
  nameOrArtist?: string;
  name?: string;
  artist?: string;
  text?: string;
}

export interface SearchTracksQuery extends SearchParams {
  count: number;
  cursor?: string;
}

const FILTER_NAMES = ['query', 'name', 'artist', 'text', 'nameOrArtist'] as const;
const MAX_FILTER_LENGTH = 200;

/** Normalize filters once so query execution and cursor scoping use identical values. */
export function parseSearchTracksQuery(raw: Record<string, unknown>): SearchTracksQuery {
  const page = parseCursorPageQuery(raw, {
    allowedParams: [...FILTER_NAMES, 'count', 'cursor'],
    cursorDecoder: decodeScopedCursor,
  });
  const filters: SearchParams = {};

  for (const name of FILTER_NAMES) {
    const value = raw[name];
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      throw new BadRequestException(`"${name}" must be a single string`);
    }
    const normalized = value.normalize('NFC').trim();
    if (normalized.length > MAX_FILTER_LENGTH) {
      throw new BadRequestException(`"${name}" must not exceed ${MAX_FILTER_LENGTH} characters`);
    }
    if (normalized) filters[name] = normalized;
  }

  if (!FILTER_NAMES.some((name) => filters[name] !== undefined)) {
    throw new BadRequestException('Provide at least one of: query, name, artist, text, nameOrArtist');
  }

  if (page.cursor && decodeScopedCursor(page.cursor).scope !== searchCursorScope(filters)) {
    throw new BadRequestException('"cursor" does not match the search filters');
  }

  return { ...page, ...filters };
}

/** Stable across processes and object property enumeration order. */
export function searchCursorScope(params: SearchParams): string {
  const canonical = ['query', 'name', 'artist', 'text'].map((name) => params[name as keyof SearchParams] ?? null);
  if (params.nameOrArtist) canonical.push(params.nameOrArtist);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
