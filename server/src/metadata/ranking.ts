import { genreKey as normalize, MBID } from '../contracts/catalog-metadata.js';
import type { MetadataCandidate, MetadataSearchDto, MetadataSearchResponse } from './metadata.contract.js';

export interface Tag { name: string; count?: number }
export interface Release {
  id: string;
  title: string;
  date?: string;
  country?: string;
  status?: string;
  disambiguation?: string;
  genres?: Tag[];
  media?: { format?: string | null; tracks?: { recording?: { id: string } }[] }[];
  'release-group'?: { 'secondary-types'?: string[] };
}
export interface Recording {
  id: string;
  title: string;
  length?: number;
  disambiguation?: string;
  'artist-credit'?: { name: string; joinphrase?: string }[];
  releases?: Release[];
  genres?: Tag[];
}

export function escapeLucene(value: string) {
  return value.replace(/[+\-!(){}\[\]^"~*?:\\/|&]/g, '\\$&');
}

function splitTitle(title: string) {
  const suffix = /\s*(?:\(([^()]+)\)|\[([^\[\]]+)\]|\s[-–—]\s(.+))\s*$/u.exec(title);
  const label = suffix?.slice(1).find(Boolean)?.trim();
  return suffix && label && /\b(radio edit|extended|remix|live)\b/iu.test(label)
    ? { title: title.slice(0, suffix.index), label }
    : { title, label: '' };
}

export function recordingSearchTitle(title: string) {
  return splitTitle(title).title || title;
}

function versionOf(title: string, disambiguation = '') {
  const split = splitTitle(title);
  const label = split.label || disambiguation;
  const kind = /\b(radio edit|extended|remix|live)\b/iu.exec(label)?.[0].toLowerCase() ?? null;
  return { base: normalize(split.title), kind, label: kind ? label.trim() : null };
}

function similarity(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(above + 1, previous[j - 1] + 1, diagonal + Number(a[i - 1] !== b[j - 1]));
      diagonal = above;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length, 1);
}

export function artistOf(recording: Recording): string | null {
  return recording['artist-credit']?.map(({ name, joinphrase }) => name + (joinphrase ?? '')).join('') || null;
}

function sameVersion(a: ReturnType<typeof versionOf>, b: ReturnType<typeof versionOf>): boolean {
  if (a.kind !== b.kind) return false;
  if (!a.kind || !a.label || !b.label) return true;
  const first = normalize(a.label);
  const second = normalize(b.label);
  return first === second || first === a.kind || second === b.kind;
}

export function versionsMatch(input: string, target: string, disambiguation?: string): boolean {
  const a = versionOf(input);
  const b = versionOf(target, disambiguation);
  return a.base === b.base && sameVersion(a, b);
}

export function candidateOf(recording: Recording, release: Release | undefined, confidence: number): MetadataCandidate {
  const formats = [...new Set(release?.media?.map(({ format }) => format).filter(Boolean))];
  const edition = [release?.country, release?.date, ...formats, release?.disambiguation].filter(Boolean).join(' · ');
  return {
    edition: edition || null,
    name: recording.title, artist: artistOf(recording), version: versionOf(recording.title, recording.disambiguation).label,
    durationMs: recording.length ?? null, recordingMbid: recording.id, releaseMbid: release?.id ?? null,
    album: release?.title ?? null, year: /^\d{4}\b/.test(release?.date ?? '') ? Number(release!.date!.slice(0, 4)) : null,
    confidence, sources: ['musicbrainz'],
  };
}

function releasePriority(release: Release | undefined): number {
  if (!release) return -1;
  return Number(release.status === 'Official') * 2 + Number(!release['release-group']?.['secondary-types']?.includes('Compilation'));
}

export function rankRecordings(input: MetadataSearchDto, recordings: Recording[]): MetadataSearchResponse {
  const target = versionOf(input.name);
  const ranked = recordings.filter((recording) => MBID.test(recording.id) && recording.title).map((recording) => {
    const version = versionOf(recording.title, recording.disambiguation);
    const versionMatch = sameVersion(target, version);
    let weight = 0.50;
    let score = 0.40 * similarity(target.base, version.base) + 0.10 * Number(versionMatch);
    const artist = artistOf(recording);
    if (input.artist && artist) {
      weight += 0.35;
      score += 0.35 * similarity(normalize(input.artist), normalize(artist));
    }
    if (input.durationMs !== undefined && recording.length != null) {
      weight += 0.15;
      const difference = Math.abs(input.durationMs - recording.length);
      score += 0.15 * Math.max(0, Math.min(1, (20_000 - difference) / 18_000));
    }
    const releases = [...new Map((recording.releases ?? []).filter((release) => MBID.test(release.id))
      .map((release) => [release.id, release])).values()].sort((a, b) => releasePriority(b) - releasePriority(a));
    // Prefer showing a different album before additional editions of an album already shown.
    const albums = new Set<string>();
    const firstEditions: Release[] = [];
    const otherEditions: Release[] = [];
    for (const release of releases) {
      const key = normalize(release.title);
      (albums.has(key) ? otherEditions : firstEditions).push(release);
      albums.add(key);
    }
    return { recording, artist, versionMatch, confidence: Math.min(1, score / weight), editions: [...firstEditions, ...otherEditions] };
  }).filter(({ confidence }) => confidence >= 0.70).sort((a, b) => b.confidence - a.confidence || releasePriority(b.editions[0]) - releasePriority(a.editions[0]));

  const candidates: MetadataCandidate[] = [];
  const seen = new Set<string>();
  const best = ranked[0];
  if (best && best.editions.length > 1) {
    for (const release of best.editions.slice(0, 2)) {
      candidates.push(candidateOf(best.recording, release, best.confidence));
      seen.add(`${best.recording.id}:${release.id}`);
    }
  }
  for (let edition = 0; edition < 5 && candidates.length < 5; edition++) {
    for (const { recording, editions, confidence } of ranked) {
      const release = editions[edition];
      if ((!release && (edition > 0 || editions.length > 0)) || candidates.length === 5) continue;
      const key = `${recording.id}:${release?.id ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidateOf(recording, release, confidence));
    }
  }
  const recommendedIndex = best && input.artist && best.artist && best.versionMatch && best.editions.length === 1
    && best.confidence >= 0.90 && best.confidence - (ranked[1]?.confidence ?? 0) >= 0.08 ? 0 : null;
  return { candidates, recommendedIndex };
}
