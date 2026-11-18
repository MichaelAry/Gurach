import { Injectable } from '@nestjs/common';
import { genreKey } from '../contracts/catalog-metadata.js';
import { providerJson } from './provider-http.js';
import { artistOf, versionsMatch, type Recording, type Release, type Tag } from './ranking.js';

interface LastFmEntity { name: string; artist: string | { name: string }; mbid?: string; toptags?: { tag: Tag[] }; tags?: { tag: Tag[] } }

@Injectable()
export class LastFmProvider {
  get enabled() { return Boolean(process.env.LASTFM_API_KEY?.trim()); }

  private async lookup(method: 'track' | 'album', params: Record<string, string>, signal: AbortSignal) {
    const apiKey = process.env.LASTFM_API_KEY?.trim();
    if (!apiKey) return;
    const url = new URL('https://ws.audioscrobbler.com/2.0/');
    url.search = new URLSearchParams({ method: `${method}.getInfo`, api_key: apiKey, format: 'json', ...params }).toString();
    const data = await providerJson<{ track?: LastFmEntity; album?: LastFmEntity; error?: number }>(
      await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]), redirect: 'error' }),
    );
    if (data.error === 6 || data.error === 7) return;
    if (data.error) throw new Error('Last.fm unavailable');
    return data[method];
  }

  private sameArtist(result: LastFmEntity, artist: string) {
    const name = typeof result.artist === 'string' ? result.artist : result.artist?.name;
    return Boolean(name && genreKey(name) === genreKey(artist));
  }

  async recording(recording: Recording, signal: AbortSignal): Promise<Tag[]> {
    let result = await this.lookup('track', { mbid: recording.id }, signal);
    const artist = artistOf(recording);
    if (!result && artist) result = await this.lookup('track', { artist, track: recording.title }, signal);
    if (!result || (result.mbid ? result.mbid !== recording.id
      : !artist || !this.sameArtist(result, artist) || !versionsMatch(result.name, recording.title, recording.disambiguation))) return [];
    return result.toptags?.tag ?? [];
  }

  async release(recording: Recording, release: Release, signal: AbortSignal): Promise<Tag[]> {
    let result = await this.lookup('album', { mbid: release.id }, signal);
    const artist = artistOf(recording);
    if (!result && artist) result = await this.lookup('album', { artist, album: release.title }, signal);
    if (!result || (result.mbid ? result.mbid !== release.id
      : !artist || !this.sameArtist(result, artist) || genreKey(result.name) !== genreKey(release.title))) return [];
    return result.tags?.tag ?? result.toptags?.tag ?? [];
  }
}
