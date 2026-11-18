import { genreKey, type GenreEvidence } from '../contracts/catalog-metadata.js';
import type { Tag } from './ranking.js';

const vocabulary = [
  'Ambient', 'Dark ambient', 'Drone', 'Dub', 'Dub techno', 'Techno', 'House', 'Deep house', 'Electronic',
  'Electronica', 'IDM', 'Drum and bass', 'Jungle', 'Trip hop', 'Downtempo', 'Trance', 'Breakbeat',
  'Synth-pop', 'Synthwave', 'Industrial', 'Experimental', 'Noise', 'Rock', 'Alternative rock', 'Indie rock',
  'Progressive rock', 'Post-rock', 'Punk rock', 'Metal', 'Heavy metal', 'Black metal', 'Death metal',
  'Pop', 'Indie pop', 'Hip hop', 'Jazz', 'Fusion', 'Blues', 'Soul', 'Funk', 'R&B', 'Disco', 'Folk',
  'Classical', 'Minimalism', 'Reggae', 'Ska', 'Country', 'Gospel', 'Shoegaze', 'New wave', 'Soundtrack',
];
const aliases = new Map(vocabulary.map((genre) => [genreKey(genre), genre]));
for (const [tag, genre] of Object.entries({
  'dnb': 'Drum and bass', 'drum & bass': 'Drum and bass', 'hip-hop': 'Hip hop',
  'trip-hop': 'Trip hop', 'synthpop': 'Synth-pop', 'electronic music': 'Electronic',
})) aliases.set(tag, genre);

export function genreRecommendations(recording: { musicbrainz: Tag[]; lastfm: Tag[] },
  release: { musicbrainz: Tag[]; lastfm: Tag[] }): GenreEvidence[] {
  for (const [scope, groups] of [['recording', recording], ['release', release]] as const) {
    const accepted = new Map<string, GenreEvidence>();
    for (const source of ['musicbrainz', 'lastfm'] as const) {
      for (const { name: rawTag, count } of groups[source]) {
        if (typeof rawTag !== 'string' || rawTag.length > 200 || (count !== undefined && count <= 0)) continue;
        const genre = aliases.get(genreKey(rawTag));
        if (genre && !accepted.has(genre)) {
          accepted.set(genre, { genre, rawTag, source, scope, confidence: scope === 'recording' ? 0.9 : 0.7 });
        }
      }
    }
    if (accepted.size) return [...accepted.values()].slice(0, 16);
  }
  return [];
}
