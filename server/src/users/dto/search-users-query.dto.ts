import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { ListFriendsDto } from '../../friends/friends.contract.js';
export class SearchUsersQueryDto extends ListFriendsDto {
  @ApiProperty({ minLength: 2, maxLength: 32 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsString() @Length(2, 32) @Matches(/^[a-z0-9_]+$/) query!: string;
}
