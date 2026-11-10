import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CommentDocument = HydratedDocument<Comment>;

@Schema({
  // timestamps: true добавляет createdAt/updatedAt — клиент показывает дату комментария
  timestamps: true,
  versionKey: false,
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

  /** Populated by the authentication phase; remains null until then. */
  @Prop({ type: Types.ObjectId })
  authorId?: Types.ObjectId;

  /** Excludes unresolved legacy rows from normal comment pages after P5 migration 002. */
  @Prop({ type: String, maxlength: 64, select: false })
  migrationQuarantineId?: string;

  /** Classification reason is private migration state, never part of the API response. */
  @Prop({ type: String, maxlength: 64, select: false })
  migrationQuarantineReason?: string;

  createdAt?: Date;

  updatedAt?: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
CommentSchema.index({ track_id: 1, _id: 1 }, { name: 'comment_track_id_id' });
