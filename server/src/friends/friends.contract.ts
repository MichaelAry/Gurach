import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
export type FriendStatus = 'self' | 'none' | 'incoming' | 'outgoing' | 'friends' | 'blocked_by_me' | 'unavailable';
export class FriendRelationship {
  @ApiProperty({ enum: ['self', 'none', 'incoming', 'outgoing', 'friends', 'blocked_by_me', 'unavailable'] }) status!: FriendStatus;
  @ApiProperty({ type: Number, nullable: true }) revision!: number | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) requestId!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) friendsSince!: string | null;
}
export class SocialUserProfile {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: FriendRelationship }) relationship!: FriendRelationship;
}
export class FriendListItem extends SocialUserProfile {
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) requestedAt!: string | null;
}
export class FriendListPage {
  @ApiProperty({ type: [FriendListItem], maxItems: 50 }) items!: FriendListItem[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class FriendsSummary {
  @ApiProperty() friendsCount!: number;
  @ApiProperty() incomingRequestsCount!: number;
  @ApiProperty() outgoingRequestsCount!: number;
  @ApiProperty() blockedUsersCount!: number;
}
export class ListFriendsDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) count: number = 20;
  @ApiPropertyOptional({ maxLength: 512 }) @IsOptional() @IsString() @MaxLength(512) cursor?: string;
}
export class ListFriendRequestsDto extends ListFriendsDto {
  @ApiProperty({ enum: ['incoming', 'outgoing'] }) @IsIn(['incoming', 'outgoing']) direction!: 'incoming' | 'outgoing';
}
export class CreateFriendRequestDto {
  @ApiProperty() @IsMongoId() targetUserId!: string;
}
export class RelationRevisionDto {
  // Zero denotes an absent relation. Persisted relations start at revision one.
  @ApiProperty({ minimum: 0 }) @Type(() => Number) @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) expectedRevision!: number;
}
