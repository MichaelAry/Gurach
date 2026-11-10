import { describe, expect, it } from 'vitest';
import { encodeScopedCursor } from '../../common/cursor.js';
import { commentsCursorScope, parseListCommentsQuery } from './list-comments-query.dto.js';

const trackId = '507f1f77bcf86cd799439011';
const after = '507f1f77bcf86cd799439012';

describe('parseListCommentsQuery', () => {
  it('normalizes the track ID and defaults to a bounded page size', () => {
    expect(parseListCommentsQuery({ trackId: trackId.toUpperCase() })).toEqual({
      trackId,
      count: 20,
    });
  });

  it('accepts only a cursor scoped to this track', () => {
    const cursor = encodeScopedCursor({ after, scope: commentsCursorScope(trackId) });
    expect(parseListCommentsQuery({ trackId, count: '5', cursor })).toEqual({ trackId, count: 5, cursor });
    expect(() => parseListCommentsQuery({ trackId: after, cursor })).toThrow(/does not match/);
  });

  it('rejects missing, malformed, repeated and unsupported query values', () => {
    expect(() => parseListCommentsQuery({})).toThrow(/trackId/);
    expect(() => parseListCommentsQuery({ trackId: 'not-an-id' })).toThrow(/ObjectId/);
    expect(() => parseListCommentsQuery({ trackId, count: ['1', '2'] })).toThrow();
    expect(() => parseListCommentsQuery({ trackId, offset: '0' })).toThrow(/Unexpected/);
  });
});
