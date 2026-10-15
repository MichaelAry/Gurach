import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { createApiTransform } from '../../common/api-json.util.js';

export type CommentDocument = HydratedDocument<Comment>;

@Schema({
  // timestamps: true добавляет createdAt/updatedAt — клиент показывает дату комментария
  timestamps: true,
  toJSON: {
    versionKey: false,
    transform: createApiTransform(),
  },
})
export class Comment {
  @Prop({ required: true })
  username: string;

  @Prop({ required: true })
  text: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Track' })
  track_id: Types.ObjectId;

  @Prop({ min: 1, max: 10 })
  rating?: number;

  createdAt?: Date;

  updatedAt?: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
