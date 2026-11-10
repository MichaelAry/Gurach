import { describe, expect, it } from 'vitest';
import {
  allowedExtension,
  assertMediaSize,
  canonicalMimeType,
  FILE_POLICY,
  normalizeMediaExtension,
  validateUploadFields,
} from './file-policy.js';

describe('media policy', () => {
  it('recognizes the documented audio and cover extension matrix and aliases', () => {
    for (const extension of ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac']) {
      expect(allowedExtension('audio', extension)).toBe(true);
    }
    for (const extension of ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif']) {
      expect(allowedExtension('picture', extension)).toBe(true);
    }
    expect(normalizeMediaExtension('.OGA')).toBe('ogg');
    expect(normalizeMediaExtension('JPEG')).toBe('jpg');
    expect(canonicalMimeType('audio', 'oga')).toBe('audio/ogg');
    expect(canonicalMimeType('picture', 'jpeg')).toBe('image/jpeg');
    expect(allowedExtension('audio', 'm3u')).toBe(false);
  });

  it('enforces empty and oversized file limits', () => {
    expect(() => assertMediaSize('audio', FILE_POLICY.maxAudioBytes)).not.toThrow();
    expect(() => assertMediaSize('audio', 0)).toThrow();
    expect(() => assertMediaSize('audio', FILE_POLICY.maxAudioBytes + 1)).toThrow();
    expect(() => assertMediaSize('picture', FILE_POLICY.maxCoverBytes + 1)).toThrow();
  });

  it('bounds accepted multipart fields and rejects unexpected or repeated values', () => {
    expect(() => validateUploadFields({ name: ' title ', artist: 'artist', text: 'lyrics', duration: '4.2' })).not.toThrow();
    expect(() => validateUploadFields({ other: 'value' })).toThrow(/Unexpected/);
    expect(() => validateUploadFields({ name: ['one', 'two'] })).toThrow(/once/);
    expect(() => validateUploadFields({ name: 'x'.repeat(FILE_POLICY.maxTitleChars + 1) })).toThrow(/too long/);
    expect(() => validateUploadFields({ name: 'x', artist: 'x', text: 'x', duration: '1', extra: 'x' })).toThrow(/Too many/);
  });
});
