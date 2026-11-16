import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsMongoId, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TrimString } from '../common/validation/text.decorators.js';
import { TrackListItem } from '../contracts/track.contract.js';
export class PlaylistWrite {
  @ApiProperty({ maxLength: 200 }) @TrimString() @IsString() @MinLength(1) @MaxLength(200) name: string;
  @ApiProperty({ type: [String], maxItems: 100 }) @IsArray() @ArrayMaxSize(100) @IsMongoId({ each: true }) trackIds: string[];
}
export class PlaylistUpdate extends PlaylistWrite {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER - 1) expectedRevision: number;
}
export class PlaylistSharing {
  @ApiProperty({ enum: ['private', 'link'], description: 'Link mode rotates the token; private revokes it.' }) @IsIn(['private', 'link']) visibility: 'private' | 'link';
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER - 1) expectedRevision: number;
}
export class PlaylistEntry {
  @ApiProperty() trackId: string;
  @ApiProperty({ type: TrackListItem, nullable: true }) track: TrackListItem | null;
}
export class PlaylistView {
  @ApiProperty() id: string;
  @ApiProperty() ownerId: string;
  @ApiProperty() name: string;
  @ApiProperty() revision: number;
  @ApiProperty({ enum: ['private', 'link'] }) visibility: 'private' | 'link';
  @ApiProperty({ type: [PlaylistEntry], maxItems: 100 }) entries: PlaylistEntry[];
}
export class PlaylistSummary {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}
export class PlaylistList {
  @ApiProperty({ type: [PlaylistSummary] }) items: PlaylistSummary[];
}
export class PlaylistLink {
  @ApiProperty({ type: String, nullable: true, description: 'Returned once, never listed. Token grants read access only.' }) token: string | null;
  @ApiProperty() revision: number;
}
