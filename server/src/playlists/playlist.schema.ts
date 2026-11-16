import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
@Schema({ timestamps: true, versionKey: false })
export class Playlist {
  @Prop({ type: Types.ObjectId, required: true }) ownerId: Types.ObjectId;
  @Prop({ required: true, maxlength: 200 }) name: string;
  @Prop({ type: [String], default: [], validate: { validator: (ids: string[]) => ids.length <= 100 && ids.every(id => /^[a-f\d]{24}$/.test(id)), message: 'Invalid playlist tracks' } }) trackIds: string[];
  @Prop({ enum: ['private', 'link'], default: 'private' }) visibility: 'private' | 'link';
  @Prop({ type: String, default: null }) tokenHash: string | null;
  @Prop({ default: 0 }) revision: number;
}
export const PlaylistSchema = SchemaFactory.createForClass(Playlist);
PlaylistSchema.index({ ownerId: 1, _id: -1 }, { name: 'playlist_owner' });
PlaylistSchema.index({ tokenHash: 1 }, { name: 'playlist_token' });
