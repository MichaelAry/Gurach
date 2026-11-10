import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { assertIsolatedTestDatabase } from '../src/common/test-database.js';
import { User, UserSchema } from '../src/auth/schemas/user.schema.js';
import { Session, SessionSchema } from '../src/auth/schemas/session.schema.js';
import { PasswordService } from '../src/auth/password.service.js';
import { SessionService } from '../src/auth/session.service.js';
import { authIndexesMigration } from '../src/scripts/migrations/004-auth-indexes.js';
import { provisionAccount } from '../src/auth/provision.service.js';

const uri = process.env.MONGODB_URI!;
assertIsolatedTestDatabase(new URL(uri).pathname.slice(1));
const connection = mongoose.createConnection(uri, { autoIndex: false });
const users = connection.model(User.name, UserSchema);
const sessions = connection.model(Session.name, SessionSchema);
const passwords = new PasswordService();
const service = new SessionService(users, sessions, passwords);
beforeAll(async () => { await connection.asPromise(); await authIndexesMigration.finalize!(connection.db!); });
afterAll(async () => { await users.deleteMany({ username: { $in: ['session_fixture', 'provision_fixture'] } }); await sessions.deleteMany({}); await connection.close(); });

it('handles provisioning races and updates explicitly with session revocation', async () => {
  const input = { username: 'Provision_Fixture', displayName: ' Provisioned ', role: 'user' as const, password: 'a long provisioning password' };
  const raced = await Promise.allSettled([provisionAccount(connection, input), provisionAccount(connection, input)]);
  expect(raced.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(raced.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect(await users.countDocuments({ username: 'provision_fixture' })).toBe(1);
  await expect(provisionAccount(connection, input)).rejects.toThrow('Account already exists');
  const user = await users.findOne({ username: 'provision_fixture' }).exec();
  await users.updateOne({ _id: user!._id }, { $set: { disabled: true } });
  await sessions.create({ userId: user!._id, tokenHash: 'provision-session', revokedAt: null, expiresAt: new Date(Date.now() + 60000) });
  await provisionAccount(connection, { ...input, role: 'admin', update: true });
  const updated = await users.findById(user!._id).exec();
  expect(updated).toMatchObject({ role: 'admin', disabled: true, displayName: 'Provisioned' });
  expect((await sessions.findOne({ userId: user!._id }).exec())?.revokedAt).toBeInstanceOf(Date);
}, 15_000);

it('rejects a login whose password changes while verification is in flight', async () => {
  const password = 'concurrent credential password';
  const user = await users.create({ username: 'credential_race', displayName: 'Race', role: 'user', disabled: false, passwordHash: await passwords.hash(password) });
  const verify = vi.spyOn(passwords, 'verify').mockImplementationOnce(async () => {
    await users.updateOne({ _id: user._id }, { $set: { passwordHash: await passwords.hash('a changed credential password') } });
    return true;
  });
  try {
    await expect(service.login('credential_race', password)).rejects.toThrow('Invalid credentials');
    expect(await sessions.countDocuments({ userId: user._id })).toBe(0);
  } finally { verify.mockRestore(); await users.deleteOne({ _id: user._id }); }
}, 15_000);

it('checks expiry/revocation and live account state without relying on TTL or leaking secrets', async () => {
  expect((await authIndexesMigration.verify(connection.db!, 100)).issueCount).toBe(0);
  const password = 'a sufficiently long password';
  const user = await users.create({ username: 'session_fixture', displayName: 'Fixture', role: 'user', disabled: false, passwordHash: await passwords.hash(password) });
  await expect(service.login('unknown_fixture', password)).rejects.toThrow('Invalid credentials');
  await expect(service.login(user.username, 'another long password')).rejects.toThrow('Invalid credentials');
  const login = await service.login(user.username, password);
  const stored = await sessions.findOne({ userId: user._id }).select('+tokenHash').lean().exec();
  expect(stored?.tokenHash).toBe(createHash('sha256').update(login.token).digest('hex'));
  expect(JSON.stringify(stored)).not.toContain(login.token);
  expect(JSON.stringify(await service.authenticate(login.token))).not.toMatch(/token|hash|password/i);
  await users.updateOne({ _id: user._id }, { $set: { role: 'admin' } });
  expect((await service.authenticate(login.token)).user.role).toBe('admin');
  await users.updateOne({ _id: user._id }, { $set: { disabled: true } });
  await expect(service.authenticate(login.token)).rejects.toThrow('Invalid session');
  await users.updateOne({ _id: user._id }, { $set: { disabled: false } });
  await sessions.updateOne({ _id: stored!._id }, { $set: { expiresAt: new Date(0) } });
  await expect(service.authenticate(login.token)).rejects.toThrow('Invalid session');
  await sessions.updateOne({ _id: stored!._id }, { $set: { expiresAt: new Date(Date.now() + 60000) } });
  await service.logout(login.token);
  await service.logout(login.token);
  await expect(service.authenticate(login.token)).rejects.toThrow('Invalid session');
}, 15_000);
