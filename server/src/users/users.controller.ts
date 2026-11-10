import { Controller, Get, Param, Query, SetMetadata } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentActor } from '../auth/session.guard.js';
import type { Actor } from '../auth/session.service.js';
import { ApiStandardErrors } from '../contracts/api-response.decorators.js';
import { SocialUserProfile } from '../friends/friends.contract.js';
import { SearchUsersQueryDto } from './dto/search-users-query.dto.js';
import { UserSearchPage } from './users.contract.js';
import { UsersService } from './users.service.js';
@SetMetadata('gurach.private', true)
@Controller('users') @ApiTags('users')
@ApiStandardErrors({ authenticated: true, notFound: true })
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get('search') @ApiOkResponse({ type: UserSearchPage })
  search(@CurrentActor() actor: Actor, @Query() query: SearchUsersQueryDto) { return this.users.search(actor.id, query); }
  @Get('by-name/:username') @ApiOkResponse({ type: SocialUserProfile })
  profile(@CurrentActor() actor: Actor, @Param('username') username: string) { return this.users.profile(actor.id, username); }
}
