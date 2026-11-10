import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateTrackDto } from './create-track.dto.js';

async function issues(value: Record<string, unknown>) {
  return validate(plainToInstance(CreateTrackDto, value));
}

describe('CreateTrackDto transport validation', () => {
  it('trims catalogue strings but preserves lyrics formatting', async () => {
    const text = '  first line\n second line  ';
    const dto = plainToInstance(CreateTrackDto, {
      name: '  Song title  ',
      artist: '  Artist  ',
      text,
      duration: '12.75',
    });

    expect(dto).toMatchObject({ name: 'Song title', artist: 'Artist', text, duration: 12.75 });
    expect(await validate(dto)).toEqual([]);
  });

  it('rejects blank and overlong required/optional track fields', async () => {
    expect((await issues({ name: '   ' })).some((x) => x.property === 'name')).toBe(true);
    expect((await issues({ name: 'x'.repeat(201) })).some((x) => x.property === 'name')).toBe(true);
    expect((await issues({ name: 'Valid', artist: 'x'.repeat(201) })).some((x) => x.property === 'artist')).toBe(true);
    expect((await issues({ name: 'Valid', text: 'x'.repeat(100_001) })).some((x) => x.property === 'text')).toBe(true);
  });

  it('accepts the documented text boundaries', async () => {
    expect(await issues({ name: 'n'.repeat(200), artist: 'a'.repeat(200), text: 't'.repeat(100_000) })).toEqual([]);
  });

  it.each(['-1', '+1', '1e2', 'Infinity', 'NaN', '1abc', ' 1']) (
    'rejects multipart duration %s',
    async (duration) => {
      const errors = await issues({ name: 'Valid', duration });
      expect(errors.some((x) => x.property === 'duration')).toBe(true);
    },
  );

  it('accepts only finite, non-negative decimal strings for duration', async () => {
    for (const duration of ['0', '0.25', '.5', '2.']) {
      expect(await issues({ name: 'Valid', duration })).toEqual([]);
    }
    expect((await issues({ name: 'Valid', duration: '99999999999999999999' })).length).toBe(0);
    expect((await issues({ name: 'Valid', duration: 1 })).some((x) => x.property === 'duration')).toBe(true);
    expect(await issues({ name: 'Valid', duration: '' })).toEqual([]);
  });
});
