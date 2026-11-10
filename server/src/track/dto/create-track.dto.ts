import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OptionalNonNegativeDecimalString, TrimString } from '../../common/validation/text.decorators.js';

// Поля picture/audio НЕ входят в DTO: они приходят только файлами
// через FileFieldsInterceptor и заполняются сервисом.
// Иначе клиент мог бы передать их в body и обойти файловый слой.
export class CreateTrackDto {
  @ApiProperty({ maxLength: 200, example: 'Track title' })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  readonly name: string;

  @ApiPropertyOptional({ maxLength: 200, example: 'Artist name' })
  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly artist?: string;

  @ApiPropertyOptional({ maxLength: 100_000, example: 'Track lyrics' })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  readonly text?: string;

  @ApiPropertyOptional({ minimum: 0, example: 180, description: 'Track duration in seconds' })
  @OptionalNonNegativeDecimalString()
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  readonly duration?: number;
}
