import { describe, expect, it } from 'vitest';
import { encodeScopedCursor } from '../../common/cursor.js';
import { parseSearchTracksQuery, searchCursorScope } from './search-tracks-query.dto.js';

const id = '507f1f77bcf86cd799439011';

describe('parseSearchTracksQuery', () => {
  it('normalizes filter text and uses standard cursor page defaults', () => {
    expect(parseSearchTracksQuery({ query: '  cafe\u0301  ' })).toEqual({
      count: 20,
      query: 'café',
    });
  });

  it('rejects missing, oversized, repeated, or unapproved filters', () => {
    expect(() => parseSearchTracksQuery({})).toThrow(/at least one/);
    expect(() => parseSearchTracksQuery({ query: 'x'.repeat(201) })).toThrow(/200/);
    expect(() => parseSearchTracksQuery({ query: ['one', 'two'] })).toThrow(/single string/);
    expect(() => parseSearchTracksQuery({ query: 'song', sort: 'name' })).toThrow(/Unexpected/);
  });

  it('accepts a scoped cursor only with the filter scope that created it', () => {
    const scope = searchCursorScope({ query: 'song' });
    const cursor = encodeScopedCursor({ after: id, scope });
    expect(parseSearchTracksQuery({ query: 'song', cursor })).toMatchObject({ query: 'song', cursor });
    expect(() => parseSearchTracksQuery({ query: 'artist', cursor })).toThrow(/does not match/);
  });
});
