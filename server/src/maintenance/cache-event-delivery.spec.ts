import { describe, expect, it, vi } from 'vitest';
import { deliverCacheEvent, type CacheEventFetch } from './cache-event-delivery.js';

describe('cache event delivery transport', () => {
  it('posts only the fixed event payload with the shared secret in a header', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    await deliverCacheEvent(
      'http://localhost:3000/api/internal/cache-events',
      'a-private-secret-that-is-never-logged',
      { eventId: 'track.deleted:507f1f77bcf86cd799439011', type: 'track.deleted', trackId: '507f1f77bcf86cd799439011' },
      fetcher as CacheEventFetch,
    );

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/internal/cache-events');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('x-gurach-cache-secret')).toBe('a-private-secret-that-is-never-logged');
    expect(init?.cache).toBe('no-store');
    expect(typeof init?.body).toBe('string');
    expect(JSON.parse(init?.body as string)).toEqual({
      eventId: 'track.deleted:507f1f77bcf86cd799439011',
      type: 'track.deleted',
      trackId: '507f1f77bcf86cd799439011',
    });
  });

  it('surfaces an HTTP status as a safe retry code without reading the response body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('private details', { status: 503 }));
    await expect(deliverCacheEvent(
      'http://localhost:3000/api/internal/cache-events',
      'a-private-secret-that-is-never-logged',
      { eventId: 'track.deleted:507f1f77bcf86cd799439011', type: 'track.deleted', trackId: '507f1f77bcf86cd799439011' },
      fetcher as CacheEventFetch,
    )).rejects.toMatchObject({ code: 'CACHE_CALLBACK_503' });
  });
});
