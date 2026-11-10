import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export interface PasswordHash {
  algorithm: 'scrypt'; version: 1; N: number; r: number; p: number;
  salt: string; hash: string;
}
const POLICY = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

@Injectable()
export class PasswordService {
  private active = 0;

  validate(password: unknown): asserts password is string {
    if (typeof password !== 'string' || Array.from(password).length < 8 || Array.from(password).length > 128 || Buffer.byteLength(password, 'utf8') > 512) {
      throw new BadRequestException('Password must contain 8 to 128 Unicode code points and at most 512 UTF-8 bytes');
    }
  }

  private async derive(password: string, salt: Buffer): Promise<Buffer> {
    if (this.active >= 2) throw new ServiceUnavailableException('Password service is busy');
    this.active += 1;
    try {
      return await new Promise<Buffer>((resolve, reject) => {
        scrypt(password, salt, 64, POLICY, (error, key) => error ? reject(error) : resolve(key));
      });
    } finally { this.active -= 1; }
  }

  async hash(password: string): Promise<PasswordHash> {
    this.validate(password);
    const salt = randomBytes(16);
    const key = await this.derive(password, salt);
    return { algorithm: 'scrypt', version: 1, N: POLICY.N, r: POLICY.r, p: POLICY.p, salt: salt.toString('hex'), hash: key.toString('hex') };
  }

  async verify(password: string, stored: unknown): Promise<boolean> {
    try { this.validate(password); } catch { return false; }
    if (!stored || typeof stored !== 'object') return false;
    const record = stored as Partial<PasswordHash>;
    if (record.algorithm !== 'scrypt' || record.version !== 1 || record.N !== POLICY.N || record.r !== 8 || record.p !== 1 ||
      typeof record.salt !== 'string' || !/^[a-f0-9]{32}$/.test(record.salt) ||
      typeof record.hash !== 'string' || !/^[a-f0-9]{128}$/.test(record.hash)) return false;
    const actual = await this.derive(password, Buffer.from(record.salt, 'hex'));
    const expected = Buffer.from(record.hash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  async dummyVerify(password: string): Promise<false> {
    const bounded = typeof password === 'string' && Buffer.byteLength(password) <= 512 ? password : 'invalid-password-placeholder';
    await this.derive(bounded, Buffer.alloc(16, 1));
    return false;
  }
}
