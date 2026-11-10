import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor.js';
import { parseCursorPageQuery } from '../track/dto/list-tracks-query.dto.js';

const id = '507f1f77bcf86cd799439011';

describe('cursor helpers', () => {
  it('round-trips a stable ObjectId position', () => {
    expect(decodeCursor(encodeCursor({ after: id }))).toEqual({ after: id });
  });

  it.each([
    '',
    'not-base64',
    Buffer.from('{"v":2,"after":"507f1f77bcf86cd799439011"}').toString('base64url'),
    Buffer.from('{"v":1,"after":{"$gt":"x"}}').toString('base64url'),
    Buffer.from('{"v":1,"after":"507f1f77bcf86cd799439011","filter":{}}').toString('base64url'),
  ])('rejects malformed cursor %s', (cursor) => {
    expect(() => decodeCursor(cursor)).toThrow();
  });

  it('rejects an oversized cursor before decoding', () => {
    expect(() => decodeCursor('a'.repeat(513))).toThrow();
  });
});

describe('parseCursorPageQuery', () => {
  it('defaults count to 20 and validates an optional cursor', () => {
    expect(parseCursorPageQuery({})).toEqual({ count: 20 });
    const cursor = encodeCursor({ after: id });
    expect(parseCursorPageQuery({ count: '100', cursor })).toEqual({ count: 100, cursor });
  });

  it.each(['', '0', '101', '1.5', '-1', ' 2', '2x'])('rejects count %j', (count) => {
    expect(() => parseCursorPageQuery({ count })).toThrow();
  });

  it('rejects repeated values, offset and malformed cursors', () => {
    expect(() => parseCursorPageQuery({ count: ['1', '2'] })).toThrow();
    expect(() => parseCursorPageQuery({ offset: '0' })).toThrow();
    expect(() => parseCursorPageQuery({ cursor: 'nope' })).toThrow();
  });
});
