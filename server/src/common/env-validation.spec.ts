import { describe, expect, it } from 'vitest';
import {
  parseSafeInteger,
  redactSecrets,
  validateHttpUrl,
  validateMongoUri,
} from './env-validation.js';

describe('environment validators', () => {
  it('accepts safe positive integer values and defaults', () => {
    expect(parseSafeInteger('PORT', undefined, 5000, 1, 65535)).toBe(5000);
    expect(parseSafeInteger('PORT', '65535', 5000, 1, 65535)).toBe(65535);
  });

  it.each(['0', '-1', '1.5', '9007199254740992', '65536'])('rejects invalid integer %s', (value) => {
    expect(() => parseSafeInteger('PORT', value, 5000, 1, 65535)).toThrow();
  });

  it('validates HTTP(S) base URLs without exposing rejected input', () => {
    expect(validateHttpUrl('API_URL', 'https://api.example.test/base/').hostname).toBe('api.example.test');
    expect(() => validateHttpUrl('API_URL', 'ftp://user:private@example.test')).toThrow(/HTTP\(S\)/);
    expect(() => validateHttpUrl('API_URL', 'https://user:private@example.test')).toThrow(/HTTP\(S\)/);
  });

  it('accepts MongoDB schemes and rejects other URI schemes', () => {
    expect(validateMongoUri('MONGODB_URI', 'mongodb://user:secret@localhost:27017/gurach')).toContain('mongodb://');
    expect(validateMongoUri('MONGODB_URI', 'mongodb+srv://cluster.example.test/gurach')).toContain('mongodb+srv://');
    expect(() => validateMongoUri('MONGODB_URI', 'http://user:secret@localhost')).toThrow(/MongoDB URI/);
  });

  it('redacts Mongo credentials and password-like values', () => {
    const message = redactSecrets('failed mongodb://user:secret@db:27017/gurach password=another-secret');
    expect(message).not.toContain('secret');
    expect(message).toContain('[REDACTED]');
  });
});
