import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RejectWhitespaceOnly } from '../../common/validation/text.decorators.js';

export class CreateCommentDto {
  @ApiProperty({ maxLength: 5_000, example: 'Great track' })
  @RejectWhitespaceOnly() @IsNotEmpty({ message: 'text must not be blank' }) @IsString() @MaxLength(5_000)
  readonly text: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, example: 8 })
  @IsOptional() @IsInt() @Min(1) @Max(10)
  readonly rating?: number;
}
