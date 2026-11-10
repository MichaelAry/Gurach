import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsUUID } from 'class-validator';
import { TrackListItem } from '../contracts/track.contract.js';

export class RecordAccountListenDto {
  @ApiProperty() @IsMongoId() trackId: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') playbackId: string;
}
export class AccountStatistics {
  @ApiProperty() uploadedTracks: number;
  @ApiProperty() totalListens: number;
  @ApiProperty() uniqueTracks: number;
  @ApiProperty() receivedListens: number;
  @ApiProperty() comments: number;
}
export class AccountHistoryItem {
  @ApiProperty() id: string;
  @ApiProperty() trackId: string;
  @ApiProperty({ format: 'date-time' }) listenedAt: string;
  @ApiProperty({ type: TrackListItem, nullable: true }) track: TrackListItem | null;
}
export class AccountHistoryPage {
  @ApiProperty({ type: [AccountHistoryItem], maxItems: 100 }) items: AccountHistoryItem[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
