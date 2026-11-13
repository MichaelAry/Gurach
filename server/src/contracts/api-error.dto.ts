import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type ApiErrorCode =
  | 'TRACK_DUPLICATE'
  | 'QUEUE_FULL' | 'QUEUE_CONFLICT' | 'QUEUE_ENTRY_INVALID' | 'TRACK_UNAVAILABLE'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'BACKEND_UNAVAILABLE'
  | 'BACKEND_TIMEOUT';

export class ApiErrorBodyDto {
  @ApiProperty({ enum: [
    'TRACK_DUPLICATE', 'QUEUE_FULL', 'QUEUE_CONFLICT', 'QUEUE_ENTRY_INVALID', 'TRACK_UNAVAILABLE',
  'VALIDATION_ERROR', 'NOT_FOUND', 'CONFLICT', 'PAYLOAD_TOO_LARGE',
    'UNSUPPORTED_MEDIA_TYPE', 'UNAUTHORIZED', 'FORBIDDEN', 'RATE_LIMITED',
    'INTERNAL_ERROR', 'BACKEND_UNAVAILABLE', 'BACKEND_TIMEOUT',
  ] })
  code!: ApiErrorCode;

  @ApiProperty({ example: 'Request validation failed' })
  message!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } })
  fieldErrors?: Record<string, string[]>;

  @ApiPropertyOptional({ description: 'Existing active track for TRACK_DUPLICATE', pattern: '^[a-f0-9]{24}$' })
  existingTrackId?: string;

  @ApiProperty({ example: '8ab23250-cc7d-49bb-9abe-386844de0871' })
  requestId!: string;
}

export class ApiErrorDto {
  @ApiProperty({ type: () => ApiErrorBodyDto })
  error!: ApiErrorBodyDto;
}
