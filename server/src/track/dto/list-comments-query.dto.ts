import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { decodeScopedCursor } from '../../common/cursor.js';
import { parseCursorPageQuery } from './list-tracks-query.dto.js';

export interface ListCommentsQuery {
  trackId: string;
  count: number;
  cursor?: string;
}

export function parseListCommentsQuery(raw: Record<string, unknown>): ListCommentsQuery {
  const page = parseCursorPageQuery(raw, {
    allowedParams: ['trackId', 'count', 'cursor'],
    cursorDecoder: decodeScopedCursor,
  });
  const value = raw.trackId;
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) {
    throw new BadRequestException('"trackId" must be a valid ObjectId');
  }
  const trackId = value.toLowerCase();
  if (page.cursor && decodeScopedCursor(page.cursor).scope !== commentsCursorScope(trackId)) {
    throw new BadRequestException('"cursor" does not match the trackId filter');
  }
  return { ...page, trackId };
}

export function commentsCursorScope(trackId: string): string {
  return createHash('sha256').update(JSON.stringify(['comments', trackId])).digest('hex');
}
