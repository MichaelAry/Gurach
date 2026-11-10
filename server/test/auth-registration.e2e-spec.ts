import { afterAll, beforeAll, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { assertIsolatedTestDatabase } from '../src/common/test-database.js';
import { User, UserSchema } from '../src/auth/schemas/user.schema.js';
import { Session, SessionSchema } from '../src/auth/schemas/session.schema.js';
import { PasswordService } from '../src/auth/password.service.js';
import { SessionService } from '../src/auth/session.service.js';

const uri = process.env.MONGODB_URI!;
assertIsolatedTestDatabase(new URL(uri).pathname.slice(1));
const connection = mongoose.createConnection(uri, { autoIndex: false });
const users = connection.model(User.name, UserSchema);
const sessions = connection.model(Session.name, SessionSchema);
const service = new SessionService(users, sessions, new PasswordService());
const username = `reg_${randomBytes(8).toString('hex')}`;
beforeAll(async () => { await connection.asPromise(); await service.onModuleInit(); await sessions.createIndexes(); });
afterAll(async () => {
  const user = await users.findOne({ username });
  if (user) { await sessions.deleteMany({ userId: user._id }); await users.deleteOne({ _id: user._id }); }
  await connection.close();
});

it('rejects invalid registration without saving an account', async () => {
  for (const invalid of ['ab', 'bad.name', 'имя', 'with space']) {
    await expect(service.register(invalid, 'Name', 'testpass8')).rejects.toMatchObject({ status: 400 });
  }
  await expect(service.register(username, '   ', 'testpass8')).rejects.toMatchObject({ status: 400 });
  await expect(service.register(username, 'Name', 'short77')).rejects.toMatchObject({ status: 400 });
  expect(await users.countDocuments({ username })).toBe(0);
});

it('enforces uniqueness under concurrent registration and supports the complete session lifecycle', async () => {
  const results = await Promise.allSettled([
    service.register(username, '  Registration test  ', 'testpass8'),
    service.register(username.toUpperCase(), '  Registration test  ', 'testpass8'),
  ]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
  expect(await users.countDocuments({ username })).toBe(1);
  const stored = await users.findOne({ username }).select('+passwordHash').lean();
  expect(stored).toMatchObject({ displayName: 'Registration test', role: 'user', disabled: false });
  expect(stored!.passwordHash.algorithm).toBe('scrypt');
  expect(JSON.stringify(stored)).not.toContain('testpass8');
  await expect(service.login(username, 'wrongpass')).rejects.toMatchObject({ status: 401 });
  const login = await service.login(username.toUpperCase(), 'testpass8');
  expect((await service.authenticate(login.token)).user.username).toBe(username);
  await service.logout(login.token);
  await expect(service.authenticate(login.token)).rejects.toMatchObject({ status: 401 });
  const again = await service.login(username, 'testpass8');
  await sessions.updateOne({ userId: stored!._id, revokedAt: null }, { $set: { expiresAt: new Date(0) } });
  await expect(service.authenticate(again.token)).rejects.toMatchObject({ status: 401 });
  const active = await service.login(username, 'testpass8');
  await users.updateOne({ _id: stored!._id }, { $set: { disabled: true } });
  await expect(service.authenticate(active.token)).rejects.toMatchObject({ status: 401 });
  await expect(service.login(username, 'testpass8')).rejects.toMatchObject({ status: 401 });
}, 20_000);
