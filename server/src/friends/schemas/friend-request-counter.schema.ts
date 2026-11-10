import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongoSchema, Types } from 'mongoose';
@Schema({ collection: 'friend_request_counters', versionKey: false })
export class FriendRequestCounter {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true }) userId!: Types.ObjectId;
  @Prop({ required: true }) day!: string;
  @Prop({ required: true, default: 0, min: 0 }) count!: number;
}
export const FriendRequestCounterSchema = SchemaFactory.createForClass(FriendRequestCounter);
FriendRequestCounterSchema.index({ userId: 1, day: 1 }, { unique: true, name: 'friend_request_counter_unique' });
