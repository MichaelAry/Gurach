import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCatalogMetadata } from '../contracts/catalog-metadata.js';
import { ArtworkProvider } from './artwork.provider.js';
import { LastFmProvider } from './lastfm.provider.js';
import { LookupCache } from './lookup-cache.js';
import { MetadataService } from './metadata.service.js';
import type { MusicBrainzProvider } from './musicbrainz.provider.js';
import { escapeLucene, rankRecordings, type Recording } from './ranking.js';
import { retryAfter } from './provider-http.js';

const recordingId = 'a0000000-0000-4000-8000-000000000001';
const releaseId = 'a0000000-0000-4000-8000-000000000002';
const secondId = 'a0000000-0000-4000-8000-000000000003';
const recording: Recording = {
  id: recordingId, title: 'ТеСТ Ａ', 'artist-credit': [{ name: 'Artist Band' }],
  releases: [{ id: releaseId, title: 'First' }], length: 100_000,
};
const signal = () => new AbortController().signal;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('catalog ranking and metadata', () => {
  it('normalizes Cyrillic and Latin, escapes Lucene, and recommends only unambiguous artist matches', () => {
    expect(escapeLucene('A+B: "C" / D && E')).toBe('A\\+B\\: \\"C\\" \\/ D \\&\\& E');
    expect(rankRecordings({ name: ' тест   A ', artist: ' ARTIST band ' }, [recording]).recommendedIndex).toBe(0);
    expect(rankRecordings({ name: 'тест A' }, [recording]).recommendedIndex).toBeNull();
    expect(rankRecordings({ name: 'completely unrelated' }, [recording]).candidates).toEqual([]);
  });

  it('keeps close recordings and distinct releases selectable and detects conflicting versions', () => {
    const live = { ...recording, id: secondId, title: 'Тест A (Live)' };
    expect(rankRecordings({ name: 'Тест A', artist: 'Artist Band' }, [live]).recommendedIndex).toBeNull();
    const variants = { ...recording, releases: [...recording.releases!, ...recording.releases!, { id: secondId, title: 'Reissue' }] };
    const multiple = rankRecordings({ name: 'Тест A', artist: 'Artist Band' }, [variants]);
    expect(multiple.recommendedIndex).toBeNull();
    expect(multiple.candidates.map((item) => item.album)).toEqual(['First', 'Reissue']);
    expect(rankRecordings({ name: 'Тест A', artist: 'Artist Band', durationMs: 100_000 },
      [recording, { ...recording, id: secondId, length: 101_000 }]).recommendedIndex).toBeNull();
  });

  it('keeps release fallback available without a Last.fm key and ignores arbitrary tags', async () => {
    vi.stubEnv('LASTFM_API_KEY', '');
    const get = vi.fn().mockResolvedValueOnce({ ...recording, genres: [{ name: 'seen live' }] })
      .mockResolvedValueOnce({ id: releaseId, genres: [{ name: 'dub techno' }, { name: 'fan favourites' }] });
    const service = new MetadataService({ get } as unknown as MusicBrainzProvider, new LastFmProvider());
    const details = await service.details({ recordingMbid: recordingId, releaseMbid: releaseId }, signal());
    expect(details.sourceStatuses.lastfm).toBe('disabled');
    expect(details.genreEvidence).toEqual([{ genre: 'Dub techno', rawTag: 'dub techno', source: 'musicbrainz', scope: 'release', confidence: 0.7 }]);
    expect(await service.details({ recordingMbid: recordingId, releaseMbid: releaseId }, signal())).toEqual(details);
    expect(get).toHaveBeenCalledTimes(2);
    get.mockResolvedValueOnce(recording).mockResolvedValueOnce({ id: secondId, media: [{ tracks: [] }] });
    await expect(service.details({ recordingMbid: recordingId, releaseMbid: secondId }, signal())).rejects.toThrow('does not contain');
  });

  it('times out Last.fm and returns partial MusicBrainz details', async () => {
    vi.stubEnv('LASTFM_API_KEY', 'fixture');
    const get = vi.fn().mockResolvedValue({ ...recording, genres: [{ name: 'ambient' }] });
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => timeout(ms === 4000 ? 20 : ms));
    vi.stubGlobal('fetch', vi.fn((_url: URL, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    })));
    try {
      const service = new MetadataService({ get } as unknown as MusicBrainzProvider, new LastFmProvider());
      await expect(service.details({ recordingMbid: recordingId, releaseMbid: releaseId }, signal())).resolves.toMatchObject({
        sourceStatuses: { musicbrainz: 'available', lastfm: 'unavailable' },
        genreEvidence: [{ genre: 'Ambient', source: 'musicbrainz' }],
      });
    } finally { timeoutSpy.mockRestore(); }
  });

  it('validates the upload snapshot and retains evidence only for selected genres', () => {
    const evidence = { genre: 'Ambient', rawTag: 'ambient', source: 'musicbrainz', scope: 'recording', confidence: 0.9 };
    expect(parseCatalogMetadata(JSON.stringify({ album: ' EP ', genres: ['Custom'], genreEvidence: [evidence] })))
      .toEqual({ album: 'EP', genres: ['Custom'], genreEvidence: [] });
    for (const invalid of [{ genres: ['Jazz', ' jazz '] }, { extra: true }, { externalIds: { releaseMbid: 'x' } },
      { genres: [null] }, { album: 'x'.repeat(201) }, { genreEvidence: [{ ...evidence, confidence: 2 }] }]) {
      expect(() => parseCatalogMetadata(JSON.stringify(invalid))).toThrow('Invalid catalog metadata');
    }
  });

  it('distinguishes provider failure from an empty cached result', async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error('throttled')).mockResolvedValue({ recordings: [] });
    const service = new MetadataService({ get } as unknown as MusicBrainzProvider, new LastFmProvider());
    await expect(service.search({ name: 'No match' }, signal())).rejects.toThrow('MusicBrainz unavailable');
    expect(await service.search({ name: 'No match' }, signal())).toEqual({ candidates: [], recommendedIndex: null });
    await service.search({ name: ' NO  MATCH ' }, signal());
    expect(get).toHaveBeenCalledTimes(2);
    expect(retryAfter('15')).toBe(15_000);
    expect(retryAfter('invalid')).toBe(1000);
  });
});

describe('provider cache and artwork', () => {
  it('joins requests, aborts when the last client leaves and permits an immediate new lookup', async () => {
    const cache = new LookupCache<number>(() => 1000);
    const first = new AbortController();
    const second = new AbortController();
    let shared: AbortSignal | undefined;
    const load = vi.fn((s: AbortSignal) => {
      shared = s;
      return new Promise<number>((_, reject) => s.addEventListener('abort', () => reject(s.reason), { once: true }));
    });
    const a = cache.get('pair', first.signal, load);
    const b = cache.get('pair', second.signal, load);
    const results = Promise.allSettled([a, b]);
    await Promise.resolve();
    first.abort();
    expect(shared?.aborted).toBe(false);
    second.abort();
    expect(shared?.aborted).toBe(true);
    expect((await results).map(({ status }) => status)).toEqual(['rejected', 'rejected']);
    expect(load).toHaveBeenCalledOnce();
    await expect(cache.get('pair', signal(), async () => 42)).resolves.toBe(42);
    await expect(cache.get('pair', signal(), async () => 0)).resolves.toBe(42);
  });

  it('checks archive redirects and type, returns intact bytes, and distinguishes a missing image', async () => {
    const bytes = Buffer.from([0, 255, 197, 2, 0]);
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 307,
      headers: { location: 'https://ia123.us.archive.org/download/art.png' } }))
      .mockResolvedValueOnce(new Response(bytes, { headers: { 'content-type': 'image/png' } }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://archive.org.evil.example/image' } }));
    vi.stubGlobal('fetch', fetch);
    const provider = new ArtworkProvider();
    await expect(provider.get(releaseId, signal())).resolves.toEqual({ bytes, type: 'image/png' });
    await expect(provider.get(releaseId, signal())).rejects.toMatchObject({ status: 404 });
    await expect(provider.get(releaseId, signal())).rejects.toMatchObject({ status: 503 });
    await expect(provider.get(releaseId, signal())).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('caps a streamed response without Content-Length', async () => {
    let emitted = 0;
    const stream = new ReadableStream({ pull(controller) {
      if (++emitted > 12) controller.close();
      else controller.enqueue(new Uint8Array(1024 * 1024));
    } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'image/jpeg' } })));
    await expect(new ArtworkProvider().get(releaseId, signal())).rejects.toMatchObject({ status: 503 });
  });
});
