import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { NOTIFICATION_KINDS, type NotificationKind } from './notification.schema.js';

export class ListNotificationsDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) count: number = 20;
  @ApiPropertyOptional({ maxLength: 512 }) @IsOptional() @IsString() @MaxLength(512) cursor?: string;
}
export class NotificationActor {
  @ApiProperty() username!: string;
  @ApiProperty() displayName!: string;
}
export class NotificationItem {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NOTIFICATION_KINDS }) kind!: NotificationKind;
  @ApiProperty({ type: NotificationActor }) actor!: NotificationActor;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) trackId!: string | null;
  @ApiProperty({ type: String, nullable: true }) commentId!: string | null;
  @ApiProperty({ type: String, nullable: true }) trackName!: string | null;
}
export class NotificationsPage {
  @ApiProperty({ type: [NotificationItem], maxItems: 50 }) items!: NotificationItem[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class UnreadNotifications {
  @ApiProperty({ minimum: 0, type: Number }) count!: number;
}
