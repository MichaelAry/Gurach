import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Res, SetMetadata } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentActor } from '../auth/session.guard.js';
import type { Actor } from '../auth/session.service.js';
import { ApiStandardErrors } from '../contracts/api-response.decorators.js';
import { CreateFriendRequestDto, FriendListPage, FriendRelationship, FriendsSummary, ListFriendRequestsDto, ListFriendsDto, RelationRevisionDto } from './friends.contract.js';
import { FriendsService } from './friends.service.js';

@SetMetadata('gurach.private', true)
@Controller('friends')
@ApiTags('friends')
@ApiStandardErrors({ authenticated: true, notFound: true, conflict: true, rateLimited: true })
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}
  @Get() @ApiOkResponse({ type: FriendListPage })
  list(@CurrentActor() actor: Actor, @Query() query: ListFriendsDto) { return this.friends.list(actor.id, query); }
  @Get('summary') @ApiOkResponse({ type: FriendsSummary })
  summary(@CurrentActor() actor: Actor) { return this.friends.summary(actor.id); }
  @Get('requests') @ApiOkResponse({ type: FriendListPage })
  requests(@CurrentActor() actor: Actor, @Query() query: ListFriendRequestsDto) { return this.friends.list(actor.id, query, query.direction); }
  @Post('requests') @ApiCreatedResponse({ type: FriendRelationship }) @ApiOkResponse({ type: FriendRelationship })
  async request(@CurrentActor() actor: Actor, @Body() dto: CreateFriendRequestDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.friends.request(actor.id, dto.targetUserId);
    response.status(result.created ? 201 : 200);
    return result.relationship;
  }
  @Post('requests/:requestId/accept') @HttpCode(200) @ApiOkResponse({ type: FriendRelationship })
  accept(@CurrentActor() actor: Actor, @Param('requestId') requestId: string) { return this.friends.accept(actor.id, requestId); }
  @Delete('requests/:requestId') @HttpCode(204) @ApiNoContentResponse()
  cancel(@CurrentActor() actor: Actor, @Param('requestId') requestId: string) { return this.friends.cancelOrReject(actor.id, requestId); }
  @Get('blocks') @ApiOkResponse({ type: FriendListPage })
  blocks(@CurrentActor() actor: Actor, @Query() query: ListFriendsDto) { return this.friends.list(actor.id, query, 'blocks'); }
  @Put('blocks/:userId') @HttpCode(204) @ApiNoContentResponse()
  block(@CurrentActor() actor: Actor, @Param('userId') userId: string, @Query() query: RelationRevisionDto) { return this.friends.block(actor.id, userId, query.expectedRevision, true); }
  @Delete('blocks/:userId') @HttpCode(204) @ApiNoContentResponse()
  unblock(@CurrentActor() actor: Actor, @Param('userId') userId: string, @Query() query: RelationRevisionDto) { return this.friends.block(actor.id, userId, query.expectedRevision, false); }
  @Delete(':userId') @HttpCode(204) @ApiNoContentResponse()
  remove(@CurrentActor() actor: Actor, @Param('userId') userId: string, @Query() query: RelationRevisionDto) { return this.friends.remove(actor.id, userId, query.expectedRevision); }
}
