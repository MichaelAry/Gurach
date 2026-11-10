import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const MEDIA_OPERATION_KINDS = ['upload', 'delete'] as const;
export type MediaOperationKind = (typeof MEDIA_OPERATION_KINDS)[number];

export const MEDIA_OPERATION_STATES = ['uploading', 'publishing', 'cleanup', 'done'] as const;
export type MediaOperationState = (typeof MEDIA_OPERATION_STATES)[number];

@Schema({ _id: false, versionKey: false })
export class ValidatedMediaMetadata {
  @Prop({ type: Number, min: 0 })
  audioDurationSeconds?: number;

  @Prop({ type: Number, min: 0 })
  audioSizeBytes?: number;

  @Prop({ type: String, maxlength: 100 })
  audioMimeType?: string;

  @Prop({ type: String, maxlength: 32 })
  audioCodec?: string;

  @Prop({ type: String, maxlength: 32 })
  audioContainer?: string;

  @Prop({ type: Number, min: 0 })
  pictureSizeBytes?: number;

  @Prop({ type: String, maxlength: 100 })
  pictureMimeType?: string;

  @Prop({ type: Number, min: 1 })
  pictureWidth?: number;

  @Prop({ type: Number, min: 1 })
  pictureHeight?: number;

  @Prop({ type: String, maxlength: 32 })
  pictureFormat?: string;

  @Prop({ type: Number, min: 1 })
  picturePages?: number;
}

export const ValidatedMediaMetadataSchema = SchemaFactory.createForClass(ValidatedMediaMetadata);

@Schema({ collection: 'mediaoperations', timestamps: true, versionKey: false })
export class MediaOperation {
  @Prop({ type: String, required: true, immutable: true, maxlength: 64 })
  operationId: string;

  @Prop({ type: String, enum: MEDIA_OPERATION_KINDS, required: true, immutable: true })
  kind: MediaOperationKind;

  @Prop({ type: Types.ObjectId, required: true, immutable: true })
  trackId: Types.ObjectId;

  /** Approved UUID media filenames, never arbitrary paths. */
  @Prop({ type: String, maxlength: 128 })
  audioKey?: string;

  @Prop({ type: String, maxlength: 128 })
  pictureKey?: string;

  /** Paths are relative to MEDIA_STAGING_DIR and validated by the staging adapter. */
  @Prop({ type: String, maxlength: 256 })
  stageDirectory?: string;

  @Prop({ type: ValidatedMediaMetadataSchema })
  metadata?: ValidatedMediaMetadata;

  @Prop({ type: Types.ObjectId, default: null })
  ownerId: Types.ObjectId | null;

  @Prop({ type: String, enum: MEDIA_OPERATION_STATES, required: true, default: 'uploading' })
  state: MediaOperationState;

  @Prop({ type: String, maxlength: 128 })
  leaseOwner?: string;

  @Prop({ type: String, maxlength: 64 })
  leaseToken?: string;

  @Prop({ type: Date })
  leaseUntil?: Date;

  @Prop({ type: Number, min: 0, required: true, default: 0 })
  attempts: number;

  @Prop({ type: Date, required: true, default: Date.now })
  nextAttemptAt: Date;

  @Prop({ type: String, maxlength: 64 })
  lastErrorCode?: string;
}

export type MediaOperationDocument = HydratedDocument<MediaOperation>;
export const MediaOperationSchema = SchemaFactory.createForClass(MediaOperation);
MediaOperationSchema.index({ operationId: 1 }, { name: 'media_operation_id_unique', unique: true });
MediaOperationSchema.index(
  { kind: 1, trackId: 1 },
  { name: 'media_operation_kind_track_unique', unique: true },
);
MediaOperationSchema.index(
  { state: 1, nextAttemptAt: 1, leaseUntil: 1, createdAt: 1 },
  { name: 'media_operation_claim' },
);
MediaOperationSchema.index({ trackId: 1, state: 1 }, { name: 'media_operation_track_state' });
