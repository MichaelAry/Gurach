import { expect, it, vi } from 'vitest';
import { Types, type Model } from 'mongoose';
import { QueueService } from './queue.service.js';
import { Queue } from './schemas/queue.schema.js';
import { TrackReadService } from '../track/track-read.service.js';

const track = { _id: new Types.ObjectId().toHexString(), name: 'Track', artist: null, audio: '/audio.mp3', picture: null, duration: null, listens: 0 };
const userId = new Types.ObjectId().toHexString();
function fixture(existing: unknown = null) {
  const queues = {
    findOne: vi.fn(() => ({ exec: async () => existing })),
    create: vi.fn(async (row) => ({ ...row, updatedAt: new Date('2026-01-01') })),
  };
  const tracks = { random: vi.fn(async () => [track]), resolve: vi.fn(async () => new Map([[track._id, track]])) };
  const service = new QueueService(queues as unknown as Model<Queue>, tracks as unknown as TrackReadService);
  return { queues, tracks, service };
}

it('initializes an absent queue once with automatic random entries', async () => {
  const { service, queues, tracks } = fixture();
  const result = await service.get(userId);
  expect(tracks.random).toHaveBeenCalledOnce();
  expect(queues.create).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ revision: 1, entries: [{ trackId: track._id, source: 'automatic', track }] });
});

it('preserves an existing queue, including a deliberately cleared one', async () => {
  const { service, queues, tracks } = fixture({ revision: 3, entries: [] });
  expect(await service.get(userId)).toMatchObject({ revision: 3, entries: [] });
  expect(tracks.random).not.toHaveBeenCalled();
  expect(queues.create).not.toHaveBeenCalled();
});

it('loads the winning queue when two sessions initialize concurrently', async () => {
  const { service, queues } = fixture();
  queues.create.mockRejectedValueOnce({ code: 11000 });
  queues.findOne.mockReturnValueOnce({ exec: async () => null }).mockReturnValueOnce({ exec: async () => ({ revision: 2, entries: [] }) });
  expect(await service.get(userId)).toMatchObject({ revision: 2, entries: [] });
});
