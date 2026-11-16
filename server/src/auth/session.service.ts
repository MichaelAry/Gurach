import { env } from '../common/env.js';
import { isEmail } from 'class-validator';
import { Types } from 'mongoose';
import { Injectable, ForbiddenException, UnauthorizedException, HttpException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
import type { Model } from 'mongoose';
import type { OnModuleInit } from '@nestjs/common';
import type { PasswordHash } from './password.service.js';
import { PasswordService } from './password.service.js';
import { User, type UserDocument, normalizeUsername } from './schemas/user.schema.js';
import { Session } from './schemas/session.schema.js';

export interface Actor { id: string; username: string; displayName: string; role: 'user' | 'admin'; preferredLocale?: 'en' | 'ru'; }
function publicUser(user: UserDocument): Actor {
  return { id: String(user._id), username: user.username, displayName: user.displayName, role: user.role, ...(user.preferredLocale ? { preferredLocale: user.preferredLocale } : {}) };
}
function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
function validToken(token: unknown): token is string { return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token); }

@Injectable()
export class SessionService implements OnModuleInit {
  private readonly loginAttempts = new Map<string, { count: number; until: number }>();
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
    private readonly passwords: PasswordService,
  ) {}

  async onModuleInit(): Promise<void> {
    // autoIndex is disabled globally. Complete this before accepting registrations.
    // createIndexes preserves existing indexes and fails startup if duplicates exist.
    await this.users.createIndexes();
    await this.sessions.createIndexes();
  }

  async register(username: string, displayName: string, password: string) {
    let normalized: string;
    try {
      normalized = normalizeUsername(username);
    } catch {
      throw new BadRequestException('Username must contain 3 to 32 ASCII letters, digits or underscores');
    }
    const name = displayName.trim();
    if (!name || name.length > 64) throw new HttpException('Invalid display name', 400);
    this.passwords.validate(password);
    if (!env.publicRegistration) throw new ForbiddenException('Public registration is disabled');
    const passwordHash = await this.passwords.hash(password);
    try {
      const user = await this.users.create({ username: normalized, displayName: name, passwordHash, role: 'user', disabled: false });
      return { id: String(user._id), username: user.username };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new ConflictException('Username already exists');
      throw error;
    }
  }

  private recoveryTokens() { return this.users.db.collection('recoverytokens'); }

  async requestRecovery(username: string) {
    let normalized: string | undefined;
    try { normalized = normalizeUsername(username); } catch { /* Generic response. */ }
    const user = normalized ? await this.users.findOne({ username: normalized, disabled: false })
      .select('+recoveryEmail +recoveryVerifiedAt').exec() : null;
    if (user?.recoveryEmail && user.recoveryVerifiedAt) {
      await this.deliverRecovery(String(user._id), user.recoveryEmail, 'reset');
    }
  }

  async requestChannel(actor: Actor, email: string, password: string) {
    if (!env.recovery.deliveryUrl || !env.recovery.secret) throw new HttpException('Recovery is not configured', 503);
    if (!isEmail(email) || email.length > 254) throw new BadRequestException('Invalid recovery email');
    const user = await this.users.findById(actor.id).select('+passwordHash').exec();
    if (!user || user.disabled || !await this.passwords.verify(password, user.passwordHash)) throw new UnauthorizedException('Invalid credentials');
    await this.deliverRecovery(actor.id, email.trim().toLowerCase(), 'verify', user.passwordHash);
  }

  private async deliverRecovery(userId: string, email: string, purpose: 'verify' | 'reset', expectedPassword?: PasswordHash) {
    const url = env.recovery.deliveryUrl;
    const secret = env.recovery.secret;
    if (!url || !secret) return;
    const token = randomBytes(32).toString('base64url');
    const hash = tokenHash(token);
    // One bounded request per identity, including across API processes.
    const now = new Date();
    const claimed = await this.users.collection.updateOne({ _id: new Types.ObjectId(userId), disabled: false,
      $or: [{ recoveryNextAt: { $exists: false } }, { recoveryNextAt: { $lte: now } }],
    }, { $set: { recoveryNextAt: new Date(now.getTime() + 60000) } });
    if (!claimed.matchedCount) return;
    try {
      await this.users.db.transaction(async (session) => {
        const fenced = await this.users.collection.updateOne({ _id: new Types.ObjectId(userId), disabled: false,
          ...(expectedPassword ? { passwordHash: expectedPassword } : { recoveryEmail: email, recoveryVerifiedAt: { $type: 'date' } }),
        }, { $inc: { sessionWriteRevision: 1 } }, { session });
        if (fenced.matchedCount !== 1) throw new Error('Recovery identity changed');
        await this.recoveryTokens().deleteMany({ userId: new Types.ObjectId(userId), purpose }, { session });
        await this.recoveryTokens().insertOne({ userId: new Types.ObjectId(userId), purpose, email, tokenHash: hash,
          expiresAt: new Date(Date.now() + env.recovery.ttlMs) }, { session });
      });
      const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify({ email, purpose, token, expiresInSeconds: env.recovery.ttlMs / 1000 }),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error('Delivery failed');
    } catch {
      // Never disclose delivery state or account existence, nor log raw tokens.
      await this.recoveryTokens().deleteOne({ tokenHash: hash }).catch(() => undefined);
    }
  }

  async confirmRecovery(token: string, password?: string) {
    if (!validToken(token)) throw new BadRequestException('Invalid or expired recovery token');
    const passwordHash = password === undefined ? undefined : await this.passwords.hash(password);
    await this.users.db.transaction(async (session) => {
      const record = await this.recoveryTokens().findOneAndDelete({ tokenHash: tokenHash(token),
        purpose: passwordHash ? 'reset' : 'verify', expiresAt: { $gt: new Date() } }, { session });
      if (!record) throw new BadRequestException('Invalid or expired recovery token');
      const filter = { _id: record.userId, disabled: false,
        ...(passwordHash ? { recoveryEmail: record.email, recoveryVerifiedAt: { $type: 'date' } } : {}),
      };
      const updated = await this.users.collection.updateOne(filter, { $set: passwordHash
        ? { passwordHash } : { recoveryEmail: record.email, recoveryVerifiedAt: new Date() },
        $inc: { sessionWriteRevision: 1 } }, { session });
      if (updated.matchedCount !== 1) throw new BadRequestException('Invalid or expired recovery token');
      await this.sessions.updateMany({ userId: record.userId, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
      await this.recoveryTokens().deleteMany({ userId: record.userId }, { session });
    });
  }

  async login(username: string, password: string) {
    let normalized: string | undefined;
    try { normalized = normalizeUsername(username); } catch { /* Unknown identity follows the dummy verification path. */ }
    const now = Date.now();
    for (const [key, value] of this.loginAttempts) if (value.until <= now) this.loginAttempts.delete(key);
    const key = normalized ?? '__invalid__';
    const attempt = this.loginAttempts.get(key);
    if ((attempt?.count ?? 0) >= 5 || (!attempt && this.loginAttempts.size >= 10000)) throw new HttpException('Too many login attempts', 429);
    this.loginAttempts.set(key, { count: (attempt?.count ?? 0) + 1, until: attempt?.until ?? now + 60000 });
    const user = normalized ? await this.users.findOne({ username: normalized }).select('+passwordHash').exec() : null;
    const verified = user ? await this.passwords.verify(password, user.passwordHash) : await this.passwords.dummyVerify(password);
    if (!user || !verified || user.disabled) throw new UnauthorizedException('Invalid credentials');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    let identity: Actor | undefined;
    await this.users.db.transaction(async (session) => {
      const current = await this.users.findOneAndUpdate(
        { _id: user._id, disabled: false, passwordHash: user.passwordHash },
        { $inc: { sessionWriteRevision: 1 } },
        { session, returnDocument: 'after' },
      ).exec();
      if (!current) throw new UnauthorizedException('Invalid credentials');
      await this.sessions.create([{ userId: current._id, tokenHash: tokenHash(token), expiresAt, revokedAt: null }], { session });
      identity = publicUser(current);
    });
    if (!identity) throw new UnauthorizedException('Invalid credentials');
    return { token, user: identity, expiresAt: expiresAt.toISOString() };
  }

  async authenticate(token: string) {
    if (!validToken(token)) throw new UnauthorizedException('Invalid session');
    const session = await this.sessions.findOne({ tokenHash: tokenHash(token), revokedAt: null, expiresAt: { $gt: new Date() } }).exec();
    if (!session) throw new UnauthorizedException('Invalid session');
    const user = await this.users.findOne({ _id: session.userId, disabled: false }).exec();
    if (!user) throw new UnauthorizedException('Invalid session');
    return { user: publicUser(user), expiresAt: session.expiresAt.toISOString() };
  }

  async logout(token: string): Promise<void> {
    if (!validToken(token)) return;
    await this.sessions.updateOne({ tokenHash: tokenHash(token), revokedAt: null }, { $set: { revokedAt: new Date() } }).exec();
  }
}
