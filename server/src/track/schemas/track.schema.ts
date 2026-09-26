import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TrackDocument = HydratedDocument<Track>;

@Schema()
export class Track {
  @Prop({ required: true })
  name: string;

  @Prop()
  artist?: string;

  @Prop()
  picture?: string;

  @Prop()
  audio?: string;

  @Prop()
  text?: string;

  @Prop({ default: 0 })
  listens?: number;

  @Prop()
  duration?: number;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Comment' }] })
  comments: Types.ObjectId[];
}

export const TrackSchema = SchemaFactory.createForClass(Track);
