import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type { PasswordHash } from '../password.service.js';

export type UserDocument = HydratedDocument<User>;
export function normalizeUsername(value: string): string {
  const username = value.toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(username)) throw new Error('Username must contain 3 to 32 ASCII letters, digits or underscores');
  return username;
}

@Schema({ timestamps: true, versionKey: false })
export class User {
  @Prop({ required: true, set: normalizeUsername })
  username: string;

  @Prop({ required: true, trim: true, minlength: 1, maxlength: 64 })
  displayName: string;

  @Prop({ required: true, enum: ['user', 'admin'], default: 'user' })
  role: 'user' | 'admin';

  @Prop({ type: Boolean, default: false, required: true })
  disabled: boolean;

  @Prop({ type: Number, default: 0, select: false })
  sessionWriteRevision: number;

  @Prop({ type: Object, required: true, select: false })
  passwordHash: PasswordHash;
}
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ username: 1 }, { unique: true, name: 'user_username_unique' });
