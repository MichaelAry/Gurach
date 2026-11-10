import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Connection } from 'mongoose';
import { PasswordService } from './password.service.js';
import { User, UserSchema, normalizeUsername } from './schemas/user.schema.js';
import { Session, SessionSchema } from './schemas/session.schema.js';

export async function provisionAccount(connection: Connection, input: {
  username: string; displayName: string; role: 'user' | 'admin'; password: string; update?: boolean;
}) {
  const username = normalizeUsername(input.username);
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 64 || !['user', 'admin'].includes(input.role)) throw new Error('Invalid account fields');
  const users = connection.models[User.name] ?? connection.model(User.name, UserSchema);
  const sessions = connection.models[Session.name] ?? connection.model(Session.name, SessionSchema);
  await users.createIndexes();
  if (!input.update && await users.exists({ username })) throw new ConflictException('Account already exists');
  const passwordHash = await new PasswordService().hash(input.password);
  if (!input.update) {
    try {
      const user = await users.create({ username, displayName, role: input.role, disabled: false, passwordHash });
      return { id: String(user._id), operation: 'created' as const };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new ConflictException('Account already exists');
      throw error;
    }
  }
  let id: string | undefined;
  await connection.transaction(async (session) => {
    const user = await users.findOneAndUpdate({ username }, { $set: { displayName, role: input.role, passwordHash } }, { session, returnDocument: 'after', runValidators: true }).exec();
    if (!user) throw new NotFoundException('Account does not exist');
    await sessions.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
    id = String(user._id);
  });
  return { id, operation: 'updated' as const };
}
