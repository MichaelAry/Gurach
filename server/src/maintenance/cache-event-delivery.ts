export interface CacheEventMessage {
  eventId: string;
  type: 'track.activated' | 'track.deleted';
  trackId: string;
}

export type CacheEventFetch = typeof fetch;

export async function deliverCacheEvent(
  url: string,
  secret: string,
  event: CacheEventMessage,
  fetcher: CacheEventFetch = fetch,
): Promise<void> {
  const response = await fetcher(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-gurach-cache-secret': secret,
    },
    body: JSON.stringify(event),
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw Object.assign(new Error('Cache event receiver rejected delivery'), {
      code: `CACHE_CALLBACK_${response.status}`,
    });
  }
}
