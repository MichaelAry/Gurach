import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, Matches } from 'class-validator';
import { PlayableTrack } from '../../contracts/track.contract.js';
export class ResolveTracksDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 100, uniqueItems: true, items: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique((id: unknown) => typeof id === 'string' ? id.toLowerCase() : id)
  @Matches(/^[a-f\d]{24}$/i, { each: true })
  ids: string[];
}
export class ResolvedTrackDto {
  @ApiProperty({ pattern: '^[a-fA-F0-9]{24}$' }) trackId: string;
  @ApiProperty({ type: PlayableTrack, nullable: true }) track: PlayableTrack | null;
  @ApiProperty({ enum: ['playable', 'unavailable'] }) availability: 'playable' | 'unavailable';
  @ApiProperty({ type: String, enum: ['deleted', 'missing-audio'], nullable: true }) reason: 'deleted' | 'missing-audio' | null;
}
export class ResolveTracksResponse {
  @ApiProperty({ type: [ResolvedTrackDto], maxItems: 100 }) items: ResolvedTrackDto[];
}
