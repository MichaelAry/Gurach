import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { MBID, GenreEvidence } from '../contracts/catalog-metadata.js';
import { TrimString } from '../common/validation/text.decorators.js';
import { FILE_POLICY } from '../file/file-policy.js';

const catalogs = ['musicbrainz', 'theaudiodb', 'discogs'] as const;
class CatalogRequest {
  @ApiPropertyOptional({ enum: catalogs })
  @ValidateIf((_, v) => v !== undefined) @IsIn(catalogs)
  source?: typeof catalogs[number];
}
export class MetadataSearchDto extends CatalogRequest {
  @ApiProperty({ maxLength: FILE_POLICY.maxTitleChars })
  @TrimString() @IsString() @IsNotEmpty() @MaxLength(FILE_POLICY.maxTitleChars)
  name: string;

  @ApiPropertyOptional({ maxLength: FILE_POLICY.maxArtistChars })
  @TrimString() @ValidateIf((_, value) => value !== undefined) @IsString() @MaxLength(FILE_POLICY.maxArtistChars)
  artist?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 3600000 })
  @ValidateIf((_, value) => value !== undefined) @IsInt() @Min(0) @Max(3600000)
  durationMs?: number;
}

export class MetadataDetailsDto extends CatalogRequest {
  @ApiPropertyOptional() @ValidateIf((_, v) => v !== undefined) @IsBoolean() lastfm?: boolean;
  @ApiPropertyOptional() @ValidateIf((_, v) => v !== undefined) @Matches(/^[1-9]\d{0,11}$/) catalogId?: string;
  @ApiPropertyOptional() @ValidateIf((_, v) => v !== undefined) @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @ValidateIf((_, v) => v !== undefined) @IsString() @MaxLength(200) artist?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((dto, v) => !dto.source || dto.source === 'musicbrainz' || v !== undefined) @IsString() @Matches(MBID)
  recordingMbid?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_, value) => value !== undefined) @IsString() @Matches(MBID)
  releaseMbid?: string;
}

export class MetadataCandidate {
  @ApiProperty() name: string;
  @ApiProperty({ type: String, nullable: true }) artist: string | null;
  @ApiProperty({ type: String, nullable: true }) version: string | null;
  @ApiProperty({ type: Number, nullable: true }) durationMs: number | null;
  @ApiPropertyOptional() catalogId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) recordingMbid?: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) releaseMbid: string | null;
  @ApiProperty({ type: String, nullable: true }) album: string | null;
  @ApiProperty({ type: String, nullable: true }) edition: string | null;
  @ApiProperty({ type: Number, nullable: true }) year: number | null;
  @ApiProperty({ minimum: 0, maximum: 1 }) confidence: number;
  @ApiProperty({ type: [String] }) sources: string[];
}

export class MetadataSearchResponse {
  @ApiProperty({ type: [MetadataCandidate], maxItems: 5 }) candidates: MetadataCandidate[];
  @ApiProperty({ type: Number, nullable: true }) recommendedIndex: number | null;
}
const sourceStatuses = ['available', 'disabled', 'unavailable'] as const;
export type SourceStatus = typeof sourceStatuses[number];

export class MetadataSourceStatuses {
  @ApiPropertyOptional({ enum: sourceStatuses }) theaudiodb?: SourceStatus;
  @ApiPropertyOptional({ enum: sourceStatuses }) discogs?: SourceStatus;
  @ApiProperty({ enum: sourceStatuses }) musicbrainz: SourceStatus;
  @ApiProperty({ enum: sourceStatuses }) lastfm: SourceStatus;
}
export class MetadataDetailsResponse extends MetadataCandidate {
  @ApiProperty({ type: [GenreEvidence] }) genreEvidence: GenreEvidence[];
  @ApiProperty({ type: String, nullable: true }) artworkUrl: string | null;
  @ApiProperty({ type: MetadataSourceStatuses }) sourceStatuses: MetadataSourceStatuses;
}
