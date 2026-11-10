import { ConflictException, NotFoundException } from '@nestjs/common';
import mongoose from 'mongoose';
import { env } from '../common/env.js';
import { normalizeUsername } from '../auth/schemas/user.schema.js';
import { provisionAccount } from '../auth/provision.service.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const update = args.at(-1) === '--update';
  if (update) args.pop();
  if (args.length !== 4 || process.stdin.isTTY) throw new Error('Expected username, display name, role and database; provide password through stdin');
  const [rawUsername, rawDisplayName, role, database] = args;
  const username = normalizeUsername(rawUsername);
  const displayName = rawDisplayName.trim();
  if (!displayName || Array.from(displayName).length > 64 || !['user', 'admin'].includes(role) || !/^[a-zA-Z0-9_-]{1,63}$/.test(database) || ['admin', 'local', 'config'].includes(database)) throw new Error('Invalid provisioning arguments');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 512) throw new Error('Password input is too large');
    chunks.push(bytes);
  }
  const password = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  try {
    await mongoose.connect(env.mongodbUri, { dbName: database, autoIndex: false });
    await provisionAccount(mongoose.connection, { username, displayName, role: role as 'user' | 'admin', password, update });
    process.stdout.write(update ? 'Account updated; existing sessions revoked\n' : 'Account provisioned\n');
  } finally { await mongoose.disconnect(); }
}

void main().catch((error: unknown) => {
  if (error instanceof ConflictException || error instanceof NotFoundException) {
    process.stderr.write(error instanceof ConflictException ? 'Account already exists; use explicit --update to change it\n' : 'Account does not exist; update refused\n');
    process.exitCode = 1;
    return;
  }
  process.stderr.write('Provisioning failed: check arguments, password policy, database access and username uniqueness\n');
  process.exitCode = 1;
});
