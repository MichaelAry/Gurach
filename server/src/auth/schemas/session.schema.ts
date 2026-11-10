import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

export type SessionDocument = HydratedDocument<Session>;
@Schema({ timestamps: true, versionKey: false })
export class Session {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userId: Types.ObjectId;
  @Prop({ required: true, select: false })
  tokenHash: string;
  @Prop({ required: true, type: Date })
  expiresAt: Date;
  @Prop({ type: Date, default: null })
  revokedAt: Date | null;
}
export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ tokenHash: 1 }, { unique: true, name: 'session_token_hash_unique' });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'session_expiry_ttl' });
