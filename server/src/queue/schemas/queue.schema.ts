import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { QUEUE_CAPACITY, UUID_PATTERN } from '../queue-policy.js';
@Schema({ _id: false })
export class QueueDisplay {
  @Prop({ required: true, maxlength: 200 }) name: string;
  @Prop({ type: String, default: null, maxlength: 200 }) artist: string | null;
}
const DisplaySchema = SchemaFactory.createForClass(QueueDisplay);
@Schema({ _id: false })
export class QueueEntry {
  @Prop({ type: String, enum: ['automatic', 'manual'], default: 'manual' }) source?: 'automatic' | 'manual';
  @Prop({ required: true, match: UUID_PATTERN }) entryId: string;
  @Prop({ type: Types.ObjectId, required: true }) trackId: Types.ObjectId;
  @Prop({ type: DisplaySchema, required: true }) display: QueueDisplay;
}
const EntrySchema = SchemaFactory.createForClass(QueueEntry);
@Schema({ timestamps: true, versionKey: false })
export class Queue {
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ required: true, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger }) revision: number;
  @Prop({ type: [EntrySchema], default: [], validate: { validator: (entries: QueueEntry[]) => entries.length <= QUEUE_CAPACITY && new Set(entries.map((entry) => entry.entryId.toLowerCase())).size === entries.length, message: 'Queue capacity or entry identity violation' } }) entries: QueueEntry[];
  @Prop({ type: String, match: UUID_PATTERN, default: null }) lastMutationId: string | null;
  @Prop({ type: String, match: /^[a-f0-9]{64}$/, default: null }) lastMutationHash: string | null;
}
export type QueueDocument = HydratedDocument<Queue>;
export const QueueSchema = SchemaFactory.createForClass(Queue);
QueueSchema.index({ userId: 1 }, { unique: true, name: 'queue_user_unique' });
