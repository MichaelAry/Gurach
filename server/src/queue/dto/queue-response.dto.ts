import { ApiProperty } from '@nestjs/swagger';
import { PlayableTrack } from '../../contracts/track.contract.js';
import { OBJECT_ID_PATTERN, QUEUE_CAPACITY, UUID_PATTERN } from '../queue-policy.js';
export class QueueDisplayDto {
  @ApiProperty({ maxLength: 200 }) name: string;
  @ApiProperty({ type: String, nullable: true, maxLength: 200 }) artist: string | null;
}
export class QueueEntryResponseDto {
  @ApiProperty({ enum: ['automatic', 'manual'] }) source: 'automatic' | 'manual';
  @ApiProperty({ format: 'uuid', pattern: UUID_PATTERN.source }) entryId: string;
  @ApiProperty({ pattern: OBJECT_ID_PATTERN.source }) trackId: string;
  @ApiProperty({ type: QueueDisplayDto }) display: QueueDisplayDto;
  @ApiProperty({ type: PlayableTrack, nullable: true }) track: PlayableTrack | null;
  @ApiProperty({ enum: ['playable', 'unavailable'] }) availability: 'playable' | 'unavailable';
  @ApiProperty({ type: String, enum: ['deleted', 'missing-audio'], nullable: true }) reason: 'deleted' | 'missing-audio' | null;
}
export class QueueResponseDto {
  @ApiProperty({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER, type: 'integer' }) revision: number;
  @ApiProperty({ enum: [QUEUE_CAPACITY], type: 'integer' }) capacity: typeof QUEUE_CAPACITY;
  @ApiProperty({ type: [QueueEntryResponseDto], maxItems: QUEUE_CAPACITY }) entries: QueueEntryResponseDto[];
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) updatedAt: string | null;
}
export function emptyQueue(): QueueResponseDto {
  return { revision: 0, capacity: QUEUE_CAPACITY, entries: [], updatedAt: null };
}
