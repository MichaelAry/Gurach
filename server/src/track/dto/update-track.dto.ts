import { IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { parseGenres } from '../../contracts/catalog-metadata.js';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TrimString } from '../../common/validation/text.decorators.js';

/** Omitted fields stay unchanged; empty strings clear artist or lyrics. */
export class UpdateTrackDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @TrimString()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  readonly album?: string;

  @ApiPropertyOptional({ type: 'array', maxItems: 16, items: { type: 'string', maxLength: 80 } })
  @Transform(({ value }) => parseGenres(value))
  @IsOptional()
  readonly genres?: string[];

  @ApiPropertyOptional({ maxLength: 200, example: 'Track title' })
  @TrimString()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  readonly name?: string;

  @ApiPropertyOptional({ maxLength: 200, example: 'Artist name' })
  @TrimString()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  readonly artist?: string;

  @ApiPropertyOptional({ maxLength: 100_000, example: 'Track lyrics' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100_000)
  readonly text?: string;
}
