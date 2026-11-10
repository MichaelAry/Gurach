import { ApiProperty } from '@nestjs/swagger';

/** A track representation safe to pass to the shared audio player. */
export class PlayableTrack {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  _id: string;
  @ApiProperty({ example: 'Track title' })
  name: string;
  @ApiProperty({ type: String, nullable: true, example: 'Artist name' })
  artist: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uri' })
  audio: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uri' })
  picture: string | null;
  @ApiProperty({ example: 10 })
  listens: number;
  @ApiProperty({ type: Number, nullable: true, example: 180 })
  duration: number | null;
}

/** Bounded catalogue projection; lyrics and comments are intentionally absent. */
export class TrackListItem extends PlayableTrack {}

/** Complete track resource. Comments are delivered through their own endpoint. */
export class TrackDetail extends TrackListItem {
  @ApiProperty({ type: String, nullable: true, example: 'Track lyrics' })
  lyrics: string | null;
  @ApiProperty({ type: String, nullable: true, example: '507f1f77bcf86cd799439012' })
  ownerId: string | null;
}

export class CursorPage<T> {
  items: T[];
  @ApiProperty({ type: String, nullable: true, example: 'eyJ2IjoxLCJhZnRlciI6Ii4uLiJ9' })
  nextCursor: string | null;
}

export class TrackListPage extends CursorPage<TrackListItem> {
  @ApiProperty({ type: [TrackListItem], maxItems: 100 })
  declare items: TrackListItem[];
}

export class TrackSearchPage extends CursorPage<TrackListItem> {
  @ApiProperty({ type: [TrackListItem], maxItems: 100 })
  declare items: TrackListItem[];
}

export class CommentResponse {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  _id: string;
  @ApiProperty({ example: '507f1f77bcf86cd799439012' })
  trackId: string;
  @ApiProperty({ type: String, nullable: true })
  authorId: string | null;
  @ApiProperty({ example: 'Listener' })
  username: string;
  @ApiProperty({ example: 'Great track' })
  text: string;
  @ApiProperty({ type: Number, nullable: true, minimum: 1, maximum: 10 })
  rating: number | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  createdAt: string | null;
}

export class CommentPage extends CursorPage<CommentResponse> {
  @ApiProperty({ type: [CommentResponse], maxItems: 100 })
  declare items: CommentResponse[];
}

export class ListenResult {
  @ApiProperty({ example: 11 })
  listens: number;
}

export class DeletionAccepted {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  _id: string;
  @ApiProperty({ example: '1db26bd1-4d9c-4672-b3a9-a4cb3cb11958' })
  operationId: string;
  @ApiProperty({ enum: ['accepted'], example: 'accepted' })
  status: 'accepted';
}
