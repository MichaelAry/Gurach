import { ApiProperty } from '@nestjs/swagger';
import { SocialUserProfile } from '../friends/friends.contract.js';
export class UserSearchPage {
  @ApiProperty({ type: [SocialUserProfile], maxItems: 50 }) items!: SocialUserProfile[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
