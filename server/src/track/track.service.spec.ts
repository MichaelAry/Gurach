import { describe, expect, it, vi } from 'vitest';
import { Connection, Model } from 'mongoose';
import { FileService } from '../file/file.service.js';
import { MediaValidatorService } from '../file/media-validator.service.js';
import { TrackDocument } from './schemas/track.schema.js';
import { MediaOperationDocument } from '../maintenance/schemas/media-operation.schema.js';
import { CacheEventDocument } from '../maintenance/schemas/cache-event.schema.js';
import { TrackService } from './track.service.js';
import { decodeScopedCursor, encodeCursor, encodeScopedCursor } from '../common/cursor.js';
import { searchCursorScope } from './dto/search-tracks-query.dto.js';

const id = '507f1f77bcf86cd799439011';

function fixture() {
  const query = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    populate: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue({ listens: 42 }),
  };
  const model = {
    find: vi.fn(() => query),
    findByIdAndUpdate: vi.fn(() => query),
    findOneAndUpdate: vi.fn(() => query),
  };
  const service = new TrackService(
    model as unknown as Model<TrackDocument>,
    {} as Model<MediaOperationDocument>,
    {} as Model<CacheEventDocument>,
    {} as Connection,
    {} as FileService,
    {} as MediaValidatorService,
  );
  return { service, model, query };
}

describe('TrackService pagination and listen contract', () => {
  it('uses a projected, ascending keyset query and returns the next cursor', async () => {
    const { service, model, query } = fixture();
    const records = Array.from({ length: 3 }, (_, index) => ({
      _id: `507f1f77bcf86cd79943901${index}`,
      name: `Track ${index}`,
      listens: index,
      audio: `audio-${index}.mp3`,
    }));
    query.exec.mockResolvedValue(records as never);

    const result = await service.getPage({ count: 2 });

    expect(model.find).toHaveBeenCalledWith({ lifecycle: 'active' });
    expect(query.select).toHaveBeenCalledWith('_id name artist audio picture duration listens');
    expect(query.sort).toHaveBeenCalledWith({ _id: 1 });
    expect(query.limit).toHaveBeenCalledWith(3);
    expect(query.populate).not.toHaveBeenCalled();
    expect(result.items.map((item) => item._id)).toEqual(records.slice(0, 2).map((r) => r._id));
    expect(result.items[0]).toMatchObject({
      artist: null,
      picture: null,
      duration: null,
      listens: 0,
      audio: expect.stringMatching(/\/static\/audio\/audio-0\.mp3$/),
    });
    expect(result.nextCursor).toBeTruthy();
  });

  it('continues strictly after the cursor id and ends without an extra row', async () => {
    const { service, model, query } = fixture();
    query.exec.mockResolvedValue([] as never);
    const cursor = encodeCursor({ after: id });

    await expect(service.getPage({ count: 20, cursor })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(model.find).toHaveBeenCalledWith({ lifecycle: 'active', _id: { $gt: expect.anything() } });
  });

  it('returns the count from the atomic increment', async () => {
    const { service, model } = fixture();
    await expect(service.listen(id)).resolves.toEqual({ listens: 42 });
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: expect.anything(), lifecycle: 'active' },
      { $inc: { listens: 1 } },
      { returnDocument: 'after' },
    );
  });

  it('reports a missing track instead of a successful listen', async () => {
    const { service, query } = fixture();
    query.exec.mockResolvedValue(null as never);
    await expect(service.listen(id)).rejects.toThrow('was not found');
  });

  it('rejects invalid IDs before touching MongoDB', async () => {
    const { service, model } = fixture();
    await expect(service.listen('invalid')).rejects.toThrow(
      'not a valid ObjectId',
    );
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('TrackService search pagination', () => {
  it('uses an escaped filter, projection and scoped keyset cursor', async () => {
    const records = [
      { _id: '507f1f77bcf86cd799439011', name: 'prefix.+one', audio: 'one.mp3' },
      { _id: '507f1f77bcf86cd799439012', name: 'prefix.+two', audio: 'two.mp3' },
      { _id: '507f1f77bcf86cd799439013', name: 'prefix.+three', audio: 'three.mp3' },
    ];
    const query = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(records),
    };
    const model = { find: vi.fn((_filter: unknown) => query) };
    const service = new TrackService(
      model as unknown as Model<TrackDocument>,
      {} as Model<MediaOperationDocument>,
      {} as Model<CacheEventDocument>,
      {} as Connection,
      {} as FileService,
      {} as MediaValidatorService,
    );
    const filters = { query: 'prefix.+' };
    const result = await service.search({ ...filters, count: 2 });

    const mongoFilter = model.find.mock.calls[0][0] as { lifecycle: string; $or: { name: RegExp }[] };
    expect(mongoFilter.lifecycle).toBe('active');
    expect(mongoFilter.$or[0].name.source).toBe('prefix\\.\\+');
    expect(query.select).toHaveBeenCalledWith('_id name artist audio picture duration listens');
    expect(query.sort).toHaveBeenCalledWith({ _id: 1 });
    expect(query.limit).toHaveBeenCalledWith(3);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).not.toHaveProperty('lyrics');
    const decoded = decodeScopedCursor(result.nextCursor!);
    expect(decoded).toEqual({ after: records[1]._id, scope: searchCursorScope(filters) });
  });

  it('adds the cursor boundary to the search query and maps search rows', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    };
    const model = { find: vi.fn((_filter: unknown) => query) };
    const service = new TrackService(
      model as unknown as Model<TrackDocument>,
      {} as Model<MediaOperationDocument>,
      {} as Model<CacheEventDocument>,
      {} as Connection,
      {} as FileService,
      {} as MediaValidatorService,
    );
    const filters = { artist: 'Artist' };
    const scope = searchCursorScope(filters);
    const cursor = encodeScopedCursor({ after: id, scope });
    await service.search({ ...filters, count: 20, cursor });
    const mongoFilter = model.find.mock.calls[0][0] as {
      artist: RegExp;
      _id: { $gt: { toString(): string } };
    };
    expect(mongoFilter.artist).toEqual(/Artist/i);
    expect(mongoFilter._id.$gt.toString()).toBe(id);
  });
});
