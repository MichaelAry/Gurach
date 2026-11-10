import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ versionKey: false })
export class AccountListen {
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) trackId: Types.ObjectId;
  @Prop({ required: true }) playbackId: string;
  @Prop({ required: true }) listenedAt: Date;
  @Prop({ required: true }) resultingListens: number;
}
export const AccountListenSchema = SchemaFactory.createForClass(AccountListen);
AccountListenSchema.index(
  { userId: 1, playbackId: 1 },
  { unique: true, name: 'account_listen_playback_unique' },
);
AccountListenSchema.index(
  { userId: 1, _id: -1 },
  { name: 'account_listen_history' },
);
AccountListenSchema.index(
  { userId: 1, trackId: 1 },
  { name: 'account_listen_tracks' },
);

AccountListenSchema.index(
  { listenedAt: -1, trackId: 1 },
  { name: 'listen_week_tracks' },
);
