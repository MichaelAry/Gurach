import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const CACHE_EVENT_TYPES = ['track.activated', 'track.deleted'] as const;
export type CacheEventType = (typeof CACHE_EVENT_TYPES)[number];

export const CACHE_EVENT_STATES = ['pending', 'delivered'] as const;
export type CacheEventState = (typeof CACHE_EVENT_STATES)[number];

@Schema({ collection: 'cacheevents', timestamps: true, versionKey: false })
export class CacheEvent {
  @Prop({ type: String, required: true, immutable: true, maxlength: 128 })
  eventId: string;

  @Prop({ type: String, enum: CACHE_EVENT_TYPES, required: true, immutable: true })
  type: CacheEventType;

  @Prop({ type: Types.ObjectId, required: true, immutable: true })
  trackId: Types.ObjectId;

  @Prop({ type: String, enum: CACHE_EVENT_STATES, required: true, default: 'pending' })
  state: CacheEventState;

  @Prop({ type: Number, min: 0, required: true, default: 0 })
  attempts: number;

  @Prop({ type: Date, required: true, default: Date.now })
  nextAttemptAt: Date;

  @Prop({ type: Date })
  deliveredAt?: Date;

  @Prop({ type: String, maxlength: 128 })
  leaseOwner?: string;

  @Prop({ type: String, maxlength: 64 })
  leaseToken?: string;

  @Prop({ type: Date })
  leaseUntil?: Date;

  @Prop({ type: String, maxlength: 64 })
  lastErrorCode?: string;
}

export type CacheEventDocument = HydratedDocument<CacheEvent>;
export const CacheEventSchema = SchemaFactory.createForClass(CacheEvent);
CacheEventSchema.index({ eventId: 1 }, { name: 'cache_event_id_unique', unique: true });
CacheEventSchema.index(
  { state: 1, nextAttemptAt: 1, leaseUntil: 1, createdAt: 1 },
  { name: 'cache_event_claim' },
);
CacheEventSchema.index({ trackId: 1, createdAt: 1 }, { name: 'cache_event_track_created' });
