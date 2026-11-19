import { BadRequestException } from '@nestjs/common';
import type { MetadataCandidate, MetadataDetailsDto, MetadataSearchDto } from './metadata.contract.js';
import { genreKey, type GenreEvidence } from '../contracts/catalog-metadata.js';
import { LookupCache } from './lookup-cache.js';
import { versionsMatch } from './ranking.js';
import type { MusicBrainzProvider } from './musicbrainz.provider.js';

interface AudioTrack {
  idTrack: string; strTrack: string; strArtist: string; strAlbum?: string; strGenre?: string; intDuration?: string;
}
interface DiscogsResult { id: number; title: string; year?: string; country?: string }
interface Credit { name: string; join?: string }
interface DiscogsTrack { title: string; duration?: string; artists?: Credit[]; sub_tracks?: DiscogsTrack[] }
interface DiscogsRelease {
  id: number; title: string; year?: number; country?: string; artists: Credit[]; tracklist: DiscogsTrack[];
  genres?: string[]; styles?: string[];
}
type Source = 'discogs' | 'theaudiodb';
function candidate(source: Source, id: string, name: string, artist: string | null, album?: string): MetadataCandidate {
  return { catalogId: id, name, artist, album: album || null, version: null, year: null, durationMs: null,
    edition: null, releaseMbid: null, confidence: 0, sources: [source] };
}
function audioCandidate(track: AudioTrack) {
  const value = candidate('theaudiodb', track.idTrack, track.strTrack, track.strArtist, track.strAlbum);
  const duration = Number(track.intDuration);
  if (Number.isSafeInteger(duration) && duration > 0) value.durationMs = duration;
  return value;
}
function credits(names: Credit[]) {
  return names.map(({ name, join }) => [name.replace(/ \(\d+\)$/, ''), join].filter(Boolean).join(' ')).join(' ').trim();
}
export class CatalogLookup {
  private readonly audioTracks = new LookupCache<AudioTrack[]>(tracks => tracks.length ? 15 * 60_000 : 60_000, 250);

  constructor(private readonly transport: MusicBrainzProvider) {}

  private audio(name: string, artist: string, signal: AbortSignal) {
    return this.audioTracks.get(JSON.stringify([genreKey(name), genreKey(artist)]), signal, async shared => {
      const key = encodeURIComponent(process.env.THEAUDIODB_API_KEY || '123');
      const url = new URL('https://www.theaudiodb.com/api/v1/json/' + key + '/searchtrack.php');
      url.search = new URLSearchParams({ s: artist, t: name }).toString();
      const data = await this.transport.request<{ track: AudioTrack[] | null }>('theaudiodb', url, 2050, {}, shared);
      return (data.track ?? []).filter(track =>
        typeof track.strTrack === 'string' && typeof track.strArtist === 'string' &&
        /^[1-9]\d{0,11}$/.test(track.idTrack) && versionsMatch(name, track.strTrack) &&
        (!artist || genreKey(track.strArtist) === genreKey(artist)),
      ).slice(0, 5);
    });
  }
  private discogs<T>(path: string, params: Record<string, string>, signal: AbortSignal) {
    const url = new URL(path, 'https://api.discogs.com');
    url.search = new URLSearchParams(params).toString();
    const headers: Record<string, string> = { 'User-Agent': 'Gurach/1.0 (https://github.com/MichaelAry/Gurach)' };
    if (process.env.DISCOGS_TOKEN) headers.Authorization = 'Discogs token=' + process.env.DISCOGS_TOKEN;
    return this.transport.request<T>('discogs', url, 2450, headers, signal);
  }
  async search(dto: MetadataSearchDto, signal: AbortSignal) {
    let candidates: MetadataCandidate[];
    if (dto.source === 'theaudiodb') {
      const tracks = await this.audio(dto.name, dto.artist ?? '', signal);
      candidates = tracks.map(audioCandidate);
    } else {
      const data = await this.discogs<{ results: DiscogsResult[] }>('/database/search',
        { type: 'release', track: dto.name, artist: dto.artist ?? '', per_page: '5' }, signal);
      candidates = data.results.slice(0, 5).map(row => {
        const value = candidate('discogs', String(row.id), dto.name, dto.artist ?? null, row.title);
        value.year = Number(row.year) || null;
        value.edition = [row.country, row.year].filter(Boolean).join(' · ') || null;
        return value;
      });
    }
    return { candidates, recommendedIndex: null };
  }
  async details(dto: MetadataDetailsDto, signal: AbortSignal) {
    const { name, artist } = dto;
    if (!dto.catalogId || !name?.trim()) throw new BadRequestException('Missing catalog ID or track name');
    let value: MetadataCandidate;
    let genres: string[];
    const source = dto.source as Source;
    if (source === 'theaudiodb') {
      const tracks = await this.audio(name, artist ?? '', signal);
      const track = tracks.find(item => item.idTrack === dto.catalogId);
      if (!track) throw new BadRequestException('Unknown track');
      value = audioCandidate(track);
      genres = track.strGenre ? [track.strGenre] : [];
    } else {
      const release = await this.discogs<DiscogsRelease>('/releases/' + dto.catalogId, {}, signal);
      const tracks = release.tracklist.flatMap(track => [track, ...(track.sub_tracks ?? [])]);
      const matches = tracks.filter(track => versionsMatch(name, track.title) &&
        (!artist || genreKey(credits(track.artists ?? release.artists)) === genreKey(artist)));
      if (String(release.id) !== dto.catalogId || matches.length !== 1) throw new BadRequestException('Track could not be matched to release');
      const track = matches[0];
      value = candidate(source, dto.catalogId, track.title, credits(track.artists ?? release.artists), release.title);
      const duration = /^(\d{1,3}):([0-5]\d)$/.exec(track.duration ?? '');
      if (duration) value.durationMs = (Number(duration[1]) * 60 + Number(duration[2])) * 1000;
      value.year = release.year || null;
      value.edition = [release.country, release.year].filter(Boolean).join(' · ') || null;
      genres = [...(release.genres ?? []), ...(release.styles ?? [])];
    }
    const unique = new Map(genres.map(genre => genre.trim()).filter(genre => genre && genre.length <= 80)
      .map(genre => [genreKey(genre), genre]));
    const genreEvidence: GenreEvidence[] = [...unique.values()].slice(0, 16).map(genre => ({
      genre, rawTag: genre, source, scope: source === 'discogs' ? 'release' : 'recording', confidence: 1,
    }));
    return { ...value, confidence: 1, genreEvidence, artworkUrl: null,
      sourceStatuses: { musicbrainz: 'disabled', lastfm: 'disabled', [source]: 'available' } as const };
  }
}
