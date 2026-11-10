import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ versionKey: false })
export class AccountFavorite {
  @Prop({ type: Types.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) trackId: Types.ObjectId;
}
export const AccountFavoriteSchema = SchemaFactory.createForClass(AccountFavorite);
AccountFavoriteSchema.index({ userId: 1, trackId: 1 }, { unique: true, name: 'account_favorite_unique' });
AccountFavoriteSchema.index({ userId: 1, _id: -1 }, { name: 'account_favorite_order' });
