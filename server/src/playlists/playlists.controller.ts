import { Body, Controller, Get, Param, Post, Put, SetMetadata } from '@nestjs/common';
import { ApiOperation, ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentActor, Public } from '../auth/session.guard.js';
import type { Actor } from '../auth/session.service.js';
import { ApiStandardErrors } from '../contracts/api-response.decorators.js';
import { PlaylistsService } from './playlists.service.js';
import { PlaylistWrite, PlaylistUpdate, PlaylistSharing, PlaylistView, PlaylistList, PlaylistLink } from './playlists.contract.js';
@SetMetadata('gurach.private', true)
@ApiTags('playlists') @ApiBearerAuth()
@ApiStandardErrors({ authenticated: true, notFound: true, conflict: true, rateLimited: true })
@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}
  @Get() @ApiOkResponse({ type: PlaylistList })
  list(@CurrentActor() actor: Actor) { return this.playlists.list(actor.id); }
  @Post() @ApiCreatedResponse({ type: PlaylistView })
  create(@CurrentActor() actor: Actor, @Body() body: PlaylistWrite) { return this.playlists.create(actor.id, body); }
  @Public() @ApiOperation({ security: [] }) @Get('shared/:token') @ApiOkResponse({ type: PlaylistView })
  shared(@Param('token') token: string) { return this.playlists.shared(token); }
  @Get(':id') @ApiOkResponse({ type: PlaylistView })
  read(@CurrentActor() actor: Actor, @Param('id') id: string) { return this.playlists.read(actor.id, id); }
  @Put(':id') @ApiOkResponse({ type: PlaylistView })
  update(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: PlaylistUpdate) { return this.playlists.update(actor.id, id, body); }
  @Put(':id/sharing') @ApiOkResponse({ type: PlaylistLink })
  sharing(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: PlaylistSharing) { return this.playlists.sharing(actor.id, id, body); }
}
