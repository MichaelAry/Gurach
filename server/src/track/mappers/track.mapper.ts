import { staticUrl } from '../../common/api-json.util.js';
import {
  TrackDetail,
  TrackListItem as TrackListItemResponse,
} from '../../contracts/track.contract.js';

export type { CursorPage } from '../../contracts/track.contract.js';
export type TrackListItem = TrackListItemResponse;

function idString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const candidate = value as { toHexString?: () => string; toString: () => string };
  if (typeof candidate.toHexString === 'function') return candidate.toHexString();
  return candidate.toString();
}

export interface TrackListRecord {
  _id: unknown;
  name: string;
  artist?: string | null;
  audio?: string | null;
  picture?: string | null;
  duration?: number | null;
  listens?: number | null;
  ownerId?: unknown;
  text?: string | null;
}

export function toTrackListItem(track: TrackListRecord): TrackListItem {
  return Object.assign(new TrackListItemResponse(), {
    _id: String(track._id),
    name: track.name,
    artist: track.artist ?? null,
    audio: staticUrl('audio', track.audio),
    picture: staticUrl('picture', track.picture),
    duration: track.duration ?? null,
    listens: track.listens ?? 0,
  });
}

export function toTrackDetail(track: TrackListRecord): TrackDetail {
  return Object.assign(new TrackDetail(), {
    _id: String(track._id),
    name: track.name,
    artist: track.artist ?? null,
    audio: staticUrl('audio', track.audio),
    picture: staticUrl('picture', track.picture),
    listens: track.listens ?? 0,
    duration: track.duration ?? null,
    lyrics: track.text ?? null,
    ownerId: track.ownerId == null ? null : idString(track.ownerId),
  });
}
