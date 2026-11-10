import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

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

  @Prop({ required: true })
  name: string;

  @Prop()
  artist?: string;

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
