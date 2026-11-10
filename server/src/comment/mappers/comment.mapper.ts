import { CommentResponse } from '../../contracts/track.contract.js';

function idString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const candidate = value as { toHexString?: () => string; toString: () => string };
  return typeof candidate.toHexString === 'function' ? candidate.toHexString() : candidate.toString();
}

export interface CommentRecord {
  _id: unknown; track_id?: unknown; trackId?: unknown; authorId?: unknown;
  username: string; text: string; rating?: number | null; createdAt?: Date | string | null;
}

export function toCommentResponse(comment: CommentRecord): CommentResponse {
  const date = comment.createdAt == null ? null : new Date(comment.createdAt);
  return Object.assign(new CommentResponse(), {
    _id: idString(comment._id), trackId: idString(comment.track_id ?? comment.trackId),
    authorId: comment.authorId == null ? null : idString(comment.authorId), username: comment.username,
    text: comment.text, rating: comment.rating ?? null,
    createdAt: date && Number.isFinite(date.valueOf()) ? date.toISOString() : null,
  });
}
