import { BadRequestException } from '@nestjs/common';
import { decodeCursor } from '../../common/cursor.js';

export interface ListTracksQuery {
  count: number;
  cursor?: string;
}

/** Shared strict parsing boundary for cursor-based list endpoints. */
export function parseCursorPageQuery(
  query: Record<string, unknown>,
  options: {
    defaultCount?: number;
    allowedParams?: readonly string[];
    cursorDecoder?: (cursor: string) => unknown;
  } = {},
): ListTracksQuery {
  const defaultCount = options.defaultCount ?? 20;
  const allowedParams = options.allowedParams ?? ['count', 'cursor'];
  const cursorDecoder = options.cursorDecoder ?? decodeCursor;

  for (const name of Object.keys(query)) {
    if (!allowedParams.includes(name)) {
      throw new BadRequestException(`Unexpected query parameter "${name}"`);
    }
  }
  if (Object.hasOwn(query, 'offset')) {
    throw new BadRequestException('"offset" is no longer supported');
  }

  const rawCount = readSingle(query, 'count');
  let count = defaultCount;
  if (rawCount !== undefined) {
    if (typeof rawCount !== 'string' || !/^\d+$/.test(rawCount)) {
      throw new BadRequestException('"count" must contain decimal digits');
    }
    count = Number(rawCount);
    if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
      throw new BadRequestException('"count" must be an integer between 1 and 100');
    }
  }

  const rawCursor = readSingle(query, 'cursor');
  if (rawCursor === undefined) return { count };
  if (typeof rawCursor !== 'string' || rawCursor.length === 0 || rawCursor.length > 512) {
    throw new BadRequestException('"cursor" must contain 1 to 512 characters');
  }
  try {
      cursorDecoder(rawCursor);
  } catch {
    throw new BadRequestException('"cursor" is malformed');
  }
  return { count, cursor: rawCursor };
}

function readSingle(query: Record<string, unknown>, name: string): unknown {
  const value = query[name];
  if (Array.isArray(value)) {
    throw new BadRequestException(`"${name}" must be supplied once`);
  }
  return value;
}
