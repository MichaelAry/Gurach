import { describe, expect, it } from 'vitest';
import { toTrackDetail, toTrackListItem } from './track.mapper.js';
import { toCommentResponse } from '../../comment/mappers/comment.mapper.js';

const id = '507f1f77bcf86cd799439011';

describe('track transport mappers', () => {
  it('projects legacy track records to a bounded list item', () => {
    const item = toTrackListItem({
      _id: id,
      name: 'Legacy',
      text: 'must not leak into list',
      ownerId: id,
    });
    expect(item).toMatchObject({
      _id: id,
      name: 'Legacy',
      artist: null,
      audio: null,
      picture: null,
      duration: null,
      listens: 0,
    });
    expect(item).not.toHaveProperty('lyrics');
    expect(item).not.toHaveProperty('ownerId');
  });

  it('maps detail fields and preserves lyric whitespace', () => {
    expect(toTrackDetail({
      _id: id,
      name: 'Legacy',
      text: '  first line\n second line  ',
    })).toMatchObject({
      _id: id,
      artist: null,
      audio: null,
      picture: null,
      duration: null,
      listens: 0,
      lyrics: '  first line\n second line  ',
      ownerId: null,
    });
  });

  it('normalizes legacy comment relations and date values', () => {
    expect(toCommentResponse({
      _id: id,
      track_id: id,
      username: 'Listener',
      text: 'Hello',
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
    })).toEqual({
      _id: id,
      trackId: id,
      authorId: null,
      username: 'Listener',
      text: 'Hello',
      rating: null,
      createdAt: '2026-01-02T03:04:05.000Z',
    });
  });
});
