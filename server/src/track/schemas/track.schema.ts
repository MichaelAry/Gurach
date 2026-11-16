import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { isDeepStrictEqual } from 'node:util';
import { normalizeTrackIdentity } from '../track-identity.js';
import { HydratedDocument, Types } from 'mongoose';
import type { AudioFingerprint } from '../../file/audio-fingerprint.service.js';

export type TrackDocument = HydratedDocument<Track>;

export const TRACK_LIFECYCLE = ['active', 'deleting', 'deleted'] as const;
export type TrackLifecycle = (typeof TRACK_LIFECYCLE)[number];

@Schema({ versionKey: false })
export class Track {
  @Prop({
    type: String,
    enum: TRACK_LIFECYCLE,
    default: 'active',
    required: true,
  })
  lifecycle: TrackLifecycle;

  @Prop({ type: Date, select: false })
  moderationRemovedAt?: Date;
  @Prop({ type: Types.ObjectId, select: false })
  moderationActorId?: Types.ObjectId;
  @Prop({ type: String, select: false, maxlength: 2000 })
  moderationReason?: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  artist?: string;

  @Prop({ type: String })
  nameKey?: string;

  @Prop({ type: String })
  artistKey?: string;

  @Prop({ type: String })
  fileSha256?: string;

  @Prop({ type: String })
  pcmSha256?: string;

  @Prop({ type: Object })
  audioFingerprint?: AudioFingerprint;

  @Prop({ type: String, required: true })
  audio: string;

  @Prop({ type: String })
  picture: string;

  @Prop()
  text?: string;

  @Prop({ type: Number, default: 0 })
  listens: number;

  /** Set from the authenticated uploader. Legacy tracks without an owner are admin-managed. */
  @Prop({ type: Types.ObjectId })
  ownerId?: Types.ObjectId;

  /** Publication time; legacy rows fall back to their ObjectId timestamp. */
  @Prop({ type: Date })
  publishedAt?: Date;

  @Prop()
  duration?: number;

  /** Updated transactionally by comment writes to conflict with track deletion. */
  @Prop({ type: Number, default: 0, min: 0 })
  commentWriteRevision: number;
}

export const TrackSchema = SchemaFactory.createForClass(Track);
TrackSchema.index({ lifecycle: 1, _id: 1 }, { name: 'track_lifecycle_id' });

TrackSchema.index(
  { ownerId: 1, lifecycle: 1, _id: -1 },
  { name: 'track_owner_activity' },
);

export const TRACK_IDENTITY_INDEX = 'track_active_name_artist_unique';
export const TRACK_IDENTITY_KEYS = { nameKey: 1, artistKey: 1 } as const;
export const TRACK_IDENTITY_PARTIAL = {
  lifecycle: 'active', nameKey: { $type: 'string' }, artistKey: { $type: 'string' },
};
export function isTrackIdentityIndex(index: {
  name?: string; unique?: boolean; key?: unknown; partialFilterExpression?: unknown; collation?: unknown;
}): boolean {
  return index.name === TRACK_IDENTITY_INDEX && index.unique === true
    && isDeepStrictEqual(index.key, TRACK_IDENTITY_KEYS)
    && isDeepStrictEqual(index.partialFilterExpression, TRACK_IDENTITY_PARTIAL)
    && !index.collation;
}
TrackSchema.index(TRACK_IDENTITY_KEYS, {
  name: TRACK_IDENTITY_INDEX, unique: true, partialFilterExpression: TRACK_IDENTITY_PARTIAL,
});
TrackSchema.pre('validate', function () {
  this.nameKey = normalizeTrackIdentity(this.name);
  this.artistKey = normalizeTrackIdentity(this.artist);
});

export const AUDIO_EXACT_INDEXES = [
  { field: 'fileSha256', name: 'track_active_file_sha256_unique' },
  { field: 'pcmSha256', name: 'track_active_pcm_sha256_unique' },
] as const;
export function audioIndexPartial(field: string) {
  return { lifecycle: 'active', [field]: { $type: 'string' } };
}
export function isAudioExactIndex(index: {
  name?: string; unique?: boolean; key?: unknown; partialFilterExpression?: unknown; collation?: unknown;
}, definition: (typeof AUDIO_EXACT_INDEXES)[number]): boolean {
  return index.name === definition.name && index.unique === true && !index.collation
    && isDeepStrictEqual(index.key, { [definition.field]: 1 })
    && isDeepStrictEqual(index.partialFilterExpression, audioIndexPartial(definition.field));
}
for (const { field, name } of AUDIO_EXACT_INDEXES) {
  TrackSchema.index({ [field]: 1 }, { name, unique: true, partialFilterExpression: audioIndexPartial(field) });
}
TrackSchema.index({ lifecycle: 1, 'audioFingerprint.duration': 1 }, { name: 'track_audio_duration_candidates' });
