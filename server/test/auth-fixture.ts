import type { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { ObjectId, type Db } from 'mongodb';
import { randomBytes, createHash } from 'node:crypto';
export const fixtureActor = { id: new ObjectId().toHexString(), username: `test_${randomBytes(8).toString('hex')}`, displayName: 'Contract Tester', role: 'admin' as const };
export async function installAdmin(app: INestApplication): Promise<string> {
  const db = app.get(getConnectionToken()).db as Db;
  const token = randomBytes(32).toString('base64url');
  await db.collection('users').insertOne({ _id: new ObjectId(fixtureActor.id), ...fixtureActor, disabled: false });
  await db.collection('sessions').insertOne({ userId: new ObjectId(fixtureActor.id), tokenHash: createHash('sha256').update(token).digest('hex'), revokedAt: null, expiresAt: new Date(Date.now() + 600000) });
  return token;
}
