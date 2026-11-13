import { ConflictException } from '@nestjs/common';

export class DuplicateTrackError extends ConflictException {
  constructor(readonly existingTrackId?: string) {
    super('An active track with this title and artist already exists');
  }
}
