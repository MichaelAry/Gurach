import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { decodeScopedCursor } from '../../common/cursor.js';
import { parseCursorPageQuery } from '../../track/dto/list-tracks-query.dto.js';

export interface ListCommentsQuery { trackId: string; count: number; cursor?: string; }

export function parseTrackCommentsQuery(trackId: string, raw: Record<string, unknown>): ListCommentsQuery {
  if (typeof trackId !== 'string' || !/^[a-f\d]{24}$/i.test(trackId)) throw new BadRequestException('"trackId" must be a valid ObjectId');
  const normalizedId = trackId.toLowerCase();
  const page = parseCursorPageQuery(raw, { allowedParams: ['count', 'cursor'], cursorDecoder: decodeScopedCursor });
  if (page.cursor && decodeScopedCursor(page.cursor).scope !== commentsCursorScope(normalizedId)) {
    throw new BadRequestException('"cursor" does not match the trackId filter');
  }
  return { ...page, trackId: normalizedId };
}

export function commentsCursorScope(trackId: string): string {
  return createHash('sha256').update(JSON.stringify(['comments', trackId])).digest('hex');
}
