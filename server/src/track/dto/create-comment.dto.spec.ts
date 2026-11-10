import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateCommentDto } from './create-comment.dto.js';

const trackId = '507f1f77bcf86cd799439011';

async function issues(value: Record<string, unknown>) {
  return validate(plainToInstance(CreateCommentDto, value));
}

describe('CreateCommentDto transport validation', () => {
  it('trims username and preserves nonblank comment text', async () => {
    const dto = plainToInstance(CreateCommentDto, {
      username: '  Listener  ',
      text: '  a comment with intentional spacing  ',
      trackId,
    });
    expect(dto.username).toBe('Listener');
    expect(dto.text).toBe('  a comment with intentional spacing  ');
    expect(await validate(dto)).toEqual([]);
  });

  it('rejects blank required values and configured length overflow', async () => {
    expect((await issues({ username: '  ', text: 'x', trackId })).some((x) => x.property === 'username')).toBe(true);
    expect((await issues({ username: 'x'.repeat(65), text: 'x', trackId })).some((x) => x.property === 'username')).toBe(true);
    expect((await issues({ username: 'ok', text: '  ', trackId })).some((x) => x.property === 'text')).toBe(true);
    expect((await issues({ username: 'ok', text: 'x'.repeat(5_001), trackId })).some((x) => x.property === 'text')).toBe(true);
  });

  it('accepts the documented username and comment boundaries', async () => {
    expect(await issues({ username: 'u'.repeat(64), text: 'c'.repeat(5_000), trackId })).toEqual([]);
  });
});
