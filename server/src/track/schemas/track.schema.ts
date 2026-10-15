import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { trackApiTransform } from '../../common/api-json.util.js';

export type TrackDocument = HydratedDocument<Track>;

@Schema({
  toJSON: {
    versionKey: false,
    transform: trackApiTransform,
  },
})
export class Track {
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

  @Prop()
  duration?: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Comment' }] })
  comments: Types.ObjectId[];
}

export const TrackSchema = SchemaFactory.createForClass(Track);
