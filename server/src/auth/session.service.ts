import { Injectable, UnauthorizedException, HttpException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
import type { Model } from 'mongoose';
import type { OnModuleInit } from '@nestjs/common';
import { PasswordService } from './password.service.js';
import { User, type UserDocument, normalizeUsername } from './schemas/user.schema.js';
import { Session } from './schemas/session.schema.js';

export interface Actor { id: string; username: string; displayName: string; role: 'user' | 'admin'; }
function publicUser(user: UserDocument): Actor {
  return { id: String(user._id), username: user.username, displayName: user.displayName, role: user.role };
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
    const passwordHash = await this.passwords.hash(password);
    try {
      const user = await this.users.create({ username: normalized, displayName: name, passwordHash, role: 'user', disabled: false });
      return { id: String(user._id), username: user.username };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new ConflictException('Username already exists');
      throw error;
    }
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
