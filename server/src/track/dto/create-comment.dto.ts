import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RejectWhitespaceOnly, TrimString } from '../../common/validation/text.decorators.js';

export class CreateCommentDto {
  @ApiProperty({ maxLength: 64, example: 'Listener' })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  readonly username: string;

  // Preserve deliberate comment whitespace; reject blank-only values separately.
  @ApiProperty({ maxLength: 5_000, example: 'Great track' })
  @RejectWhitespaceOnly()
  @IsNotEmpty({ message: 'text must not be blank' })
  @IsString()
  @MaxLength(5_000)
  readonly text: string;

  @ApiProperty({ pattern: '^[a-fA-F0-9]{24}$', example: '507f1f77bcf86cd799439011' })
  @IsString()
  @IsNotEmpty()
  readonly trackId: string;

  /** Целое 1..10, в соответствии с ограничением схемы Comment. */
  @ApiPropertyOptional({ minimum: 1, maximum: 10, example: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  readonly rating?: number;
}
