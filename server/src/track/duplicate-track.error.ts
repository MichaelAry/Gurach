import { ConflictException } from '@nestjs/common';

export type DuplicateReason = 'identity' | 'file_sha256' | 'decoded_audio_sha256' | 'chromaprint';
const messages: Record<DuplicateReason, string> = {
  identity: 'An active track with this title and artist already exists',
  file_sha256: 'This file is a byte-for-byte copy of an active track',
  decoded_audio_sha256: 'The decoded audio samples and channels match an active track',
  chromaprint: 'The duration and full-length audio fingerprints closely match an active track',
};

export class DuplicateTrackError extends ConflictException {
  constructor(readonly existingTrackId?: string, readonly duplicateReason: DuplicateReason = 'identity') {
    super(messages[duplicateReason]);
  }
}
