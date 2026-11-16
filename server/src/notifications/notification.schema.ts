import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export const NOTIFICATION_KINDS = ['friend.requested', 'friend.accepted', 'track.commented'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

@Schema({ collection: 'notifications', versionKey: false })
export class Notification {
  @Prop({ required: true }) eventKey!: string;
  @Prop({ type: String, enum: NOTIFICATION_KINDS, required: true }) kind!: NotificationKind;
  @Prop({ type: Types.ObjectId, required: true }) recipientId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) actorId!: Types.ObjectId;
  @Prop({ type: String }) requestId?: string;
  @Prop({ type: Types.ObjectId }) trackId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) commentId?: Types.ObjectId;
  @Prop({ type: Date, required: true }) createdAt!: Date;
  @Prop({ type: Date, default: null }) readAt!: Date | null;
}
export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ eventKey: 1 }, { name: 'notification_event_unique', unique: true });
NotificationSchema.index({ recipientId: 1, _id: -1 }, { name: 'notification_inbox' });
NotificationSchema.index({ recipientId: 1, readAt: 1, _id: -1 }, { name: 'notification_unread' });
