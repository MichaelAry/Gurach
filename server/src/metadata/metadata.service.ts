import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { genreKey, MBID } from '../contracts/catalog-metadata.js';
import { genreRecommendations } from './genres.js';
import { LastFmProvider } from './lastfm.provider.js';
import { LookupCache } from './lookup-cache.js';
import type { MetadataDetailsDto, MetadataDetailsResponse, MetadataSearchDto, MetadataSearchResponse, SourceStatus } from './metadata.contract.js';
import { MusicBrainzProvider } from './musicbrainz.provider.js';
import { candidateOf, escapeLucene, rankRecordings, recordingSearchTitle, type Recording, type Release, type Tag } from './ranking.js';

const successTtl = 15 * 60_000;
const cacheEntriesPerEndpoint = 250;

@Injectable()
export class MetadataService {
  private readonly searches = new LookupCache<MetadataSearchResponse>((value) => value.candidates.length ? successTtl : 60_000, cacheEntriesPerEndpoint);
  private readonly detailsCache = new LookupCache<MetadataDetailsResponse>((value) => {
    if (Object.values(value.sourceStatuses).includes('unavailable')) return 0;
    return value.genreEvidence.length ? successTtl : 60_000;
  }, cacheEntriesPerEndpoint);

  constructor(private readonly musicbrainz: MusicBrainzProvider, private readonly lastfm: LastFmProvider) {}

  async search(dto: MetadataSearchDto, signal: AbortSignal) {
    const key = JSON.stringify([genreKey(dto.name), genreKey(dto.artist ?? ''), dto.durationMs]);
    return this.searches.get(key, signal, async (sharedSignal) => {
      const deadline = AbortSignal.any([sharedSignal, AbortSignal.timeout(8000)]);
      const query = `recording:"${escapeLucene(recordingSearchTitle(dto.name))}"` + (dto.artist ? ` AND artist:"${escapeLucene(dto.artist)}"` : '');
      try {
        const data = await this.musicbrainz.get<{ recordings: Recording[] }>('recording', { query, limit: '20' }, deadline);
        return rankRecordings(dto, data.recordings);
      } catch {
        throw new ServiceUnavailableException('MusicBrainz unavailable');
      }
    });
  }

  async details(dto: MetadataDetailsDto, signal: AbortSignal) {
    const recordingMbid = dto.recordingMbid.toLowerCase();
    const releaseMbid = dto.releaseMbid?.toLowerCase();
    return this.detailsCache.get(JSON.stringify([recordingMbid, releaseMbid]), signal, async (sharedSignal) => {
      const deadline = AbortSignal.any([sharedSignal, AbortSignal.timeout(9000)]);
      let recording: Recording;
      try {
        recording = await this.musicbrainz.get<Recording>(`recording/${recordingMbid}`, { inc: 'artist-credits+releases+genres' }, deadline);
        if (recording.id !== recordingMbid || !recording.title) throw new Error('Unexpected recording response');
      } catch {
        throw new ServiceUnavailableException('MusicBrainz unavailable');
      }
      let release: Release | undefined;
      if (releaseMbid) {
        release = recording.releases?.find(({ id }) => id === releaseMbid);
        if (!release) {
          // A lookup can embed only the first 25 releases. Verify a missing pair via the release's tracks.
          let edition: Release;
          try {
            edition = await this.musicbrainz.get(`release/${releaseMbid}`, { inc: 'recordings+genres' }, deadline);
          } catch {
            throw new ServiceUnavailableException('MusicBrainz release lookup unavailable');
          }
          if (edition.id !== releaseMbid || !edition.media?.some(({ tracks }) =>
            tracks?.some((track) => track.recording?.id === recordingMbid))) {
            throw new BadRequestException('Release does not contain the recording');
          }
          release = edition;
        }
      } else {
        const releases = [...new Map((recording.releases ?? []).filter(({ id }) => MBID.test(id)).map((item) => [item.id, item])).values()];
        if (releases.length === 1) release = releases[0];
      }
      let musicbrainz: SourceStatus = 'available';
      let lastfm: SourceStatus = this.lastfm.enabled ? 'available' : 'disabled';
      const fromLastFm = async (load: () => Promise<Tag[]>) => {
        if (!this.lastfm.enabled || lastfm === 'unavailable') return [];
        try { return await load(); } catch { lastfm = 'unavailable'; return []; }
      };
      const recordingTags = { musicbrainz: recording.genres ?? [], lastfm: await fromLastFm(() => this.lastfm.recording(recording, deadline)) };
      let evidence = genreRecommendations(recordingTags, { musicbrainz: [], lastfm: [] });
      if (!evidence.length && release) {
        const selected = release;
        let releaseTags = selected.genres;
        if (!releaseTags) {
          try { releaseTags = (await this.musicbrainz.get<Release>(`release/${selected.id}`, { inc: 'genres' }, deadline)).genres; }
          catch { musicbrainz = 'unavailable'; }
        }
        const lastFmTags = await fromLastFm(() => this.lastfm.release(recording, selected, deadline));
        evidence = genreRecommendations(recordingTags, { musicbrainz: releaseTags ?? [], lastfm: lastFmTags });
      }
      const candidate = candidateOf(recording, release, 1);
      return {
        ...candidate,
        sources: [...candidate.sources, ...(evidence.some(({ source }) => source === 'lastfm') ? ['lastfm'] : [])],
        genreEvidence: evidence,
        artworkUrl: release ? `/api/metadata/artwork/${release.id}` : null,
        sourceStatuses: { musicbrainz, lastfm },
      };
    });
  }
}
