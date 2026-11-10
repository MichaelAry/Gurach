import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, Matches, Max, Min, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OBJECT_ID_PATTERN, QUEUE_CAPACITY, UUID_PATTERN } from '../queue-policy.js';
export class QueueEntryWriteDto {
  @ApiPropertyOptional({ enum: ['automatic', 'manual'], description: 'New entries default to manual; existing entries retain their source when omitted.' })
  @IsOptional() @IsIn(['automatic', 'manual'])
  source?: 'automatic' | 'manual';
  @ApiProperty({ format: 'uuid', pattern: UUID_PATTERN.source })
  @Matches(UUID_PATTERN)
  entryId: string;
  @ApiProperty({ pattern: OBJECT_ID_PATTERN.source })
  @Matches(OBJECT_ID_PATTERN)
  trackId: string;
}
export class QueueWriteDto {
  @ApiProperty({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER, type: 'integer' })
  @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision: number;
  @ApiProperty({ format: 'uuid', pattern: UUID_PATTERN.source })
  @Matches(UUID_PATTERN)
  mutationId: string;
  @ApiProperty({ type: [QueueEntryWriteDto], maxItems: QUEUE_CAPACITY })
  @IsArray() @ArrayMaxSize(QUEUE_CAPACITY)
  @ArrayUnique((entry: QueueEntryWriteDto) => typeof entry?.entryId === 'string' ? entry.entryId.toLowerCase() : entry?.entryId)
  @ValidateNested({ each: true }) @Type(() => QueueEntryWriteDto)
  entries: QueueEntryWriteDto[];
}
