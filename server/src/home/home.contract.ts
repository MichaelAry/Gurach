import { ApiProperty } from '@nestjs/swagger';
import { CursorPage, TrackListItem } from '../contracts/track.contract.js';

export class HomeReleasesPage extends CursorPage<TrackListItem> {
  @ApiProperty({ type: [TrackListItem], maxItems: 20 })
  declare items: TrackListItem[];
}

export class HomePopularResponse {
  @ApiProperty({ type: [TrackListItem], maxItems: 6 })
  items: TrackListItem[];
}

export class HomeActivityUser {
  @ApiProperty() username: string;
  @ApiProperty() displayName: string;
}

export class HomeActivityItem {
  @ApiProperty() id: string;
  @ApiProperty({ type: HomeActivityUser }) user: HomeActivityUser;
  @ApiProperty({ enum: ['upload', 'comment', 'rating'] })
  action: 'upload' | 'comment' | 'rating';
  @ApiProperty({ type: TrackListItem }) track: TrackListItem;
  @ApiProperty({ format: 'date-time' }) at: string;
}

export class HomeActivityPage extends CursorPage<HomeActivityItem> {
  @ApiProperty({ type: [HomeActivityItem], maxItems: 20 })
  declare items: HomeActivityItem[];
}
