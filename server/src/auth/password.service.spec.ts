import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('real scrypt policy', () => {
  it('accepts eight-character passwords for hashing and login and rejects seven', async () => {
    const service = new PasswordService();
    await expect(service.hash('1234567')).rejects.toThrow();
    const hash = await service.hash('12345678');
    expect(await service.verify('12345678', hash)).toBe(true);
    expect(await service.verify('1234567', hash)).toBe(false);
  });

  it('salts hashes, verifies safely and rejects overload', async () => {
    const service = new PasswordService();
    const password = ' a long Unicode password 🔑 ';
    const first = service.hash(password);
    const second = service.hash(password);
    await expect(service.hash(password)).rejects.toThrow('busy');
    const [a, b] = await Promise.all([first, second]);
    expect(a.salt).not.toBe(b.salt);
    expect(await service.verify(password, a)).toBe(true);
    expect(await service.verify('a different long password', a)).toBe(false);
    expect(await service.verify(password, { ...a, N: 1 })).toBe(false);
    expect(await service.verify(password, { ...a, hash: 'invalid' })).toBe(false);
    expect(await service.dummyVerify(password)).toBe(false);
    expect(() => service.validate('short')).toThrow();
    expect(() => service.validate('🔑'.repeat(128))).not.toThrow();
    expect(() => service.validate('🔑'.repeat(129))).toThrow();
  }, 15_000);
});
