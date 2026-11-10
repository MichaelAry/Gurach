import { Body, Controller, Delete, Param, Put, Get, Header, HttpCode, Post, Query, SetMetadata } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentActor } from '../auth/session.guard.js';
import type { Actor } from '../auth/session.service.js';
import { ApiStandardErrors } from '../contracts/api-response.decorators.js';
import { ListenResult, TrackListPage } from '../contracts/track.contract.js';
import { decodeScopedCursor } from '../common/cursor.js';
import { env } from '../common/env.js';
import { parseCursorPageQuery } from '../track/dto/list-tracks-query.dto.js';
import { AccountHistoryPage, AccountStatistics, RecordAccountListenDto } from './account.contract.js';
import { AccountService } from './account.service.js';

@SetMetadata('gurach.private', true)
@Controller('account')
@ApiTags('account')
export class AccountController {
  constructor(private readonly accounts: AccountService) {}

  @Get('statistics') @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AccountStatistics }) @ApiStandardErrors({ authenticated: true })
  statistics(@CurrentActor() actor: Actor) { return this.accounts.statistics(actor.id); }

  @Get('uploads') @Header('Cache-Control', 'private, no-store')
  @ApiQuery({ name: 'count', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: 'cursor', required: false, type: String, maxLength: 512 })
  @ApiOkResponse({ type: TrackListPage }) @ApiStandardErrors({ authenticated: true })
  uploads(@CurrentActor() actor: Actor, @Query() query: Record<string, unknown>) {
    return this.accounts.uploads(actor.id, parseCursorPageQuery(query, { cursorDecoder: decodeScopedCursor }));
  }

  @Get('history') @Header('Cache-Control', 'private, no-store')
  @ApiQuery({ name: 'count', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: 'cursor', required: false, type: String, maxLength: 512 })
  @ApiOkResponse({ type: AccountHistoryPage }) @ApiStandardErrors({ authenticated: true })
  history(@CurrentActor() actor: Actor, @Query() query: Record<string, unknown>) {
    return this.accounts.history(actor.id, parseCursorPageQuery(query, { cursorDecoder: decodeScopedCursor }));
  }

  @Get('favorite-ids') @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: [String] }) @ApiStandardErrors({ authenticated: true })
  favoriteIds(@CurrentActor() actor: Actor) { return this.accounts.favoriteIds(actor.id); }

  @Get('favorites') @Header('Cache-Control', 'private, no-store')
  @ApiQuery({ name: 'count', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: 'cursor', required: false, type: String, maxLength: 512 })
  @ApiOkResponse({ type: TrackListPage }) @ApiStandardErrors({ authenticated: true })
  favorites(@CurrentActor() actor: Actor, @Query() query: Record<string, unknown>) {
    return this.accounts.favorites(actor.id, parseCursorPageQuery(query, { cursorDecoder: decodeScopedCursor }));
  }

  @Put('favorites/:id') @HttpCode(204) @Header('Cache-Control', 'private, no-store')
  @ApiParam({ name: 'id', type: String })
  @ApiNoContentResponse() @ApiStandardErrors({ authenticated: true, notFound: true })
  addFavorite(@CurrentActor() actor: Actor, @Param('id') id: string) { return this.accounts.setFavorite(actor.id, id, true); }

  @Delete('favorites/:id') @HttpCode(204) @Header('Cache-Control', 'private, no-store')
  @ApiParam({ name: 'id', type: String })
  @ApiNoContentResponse() @ApiStandardErrors({ authenticated: true })
  removeFavorite(@CurrentActor() actor: Actor, @Param('id') id: string) { return this.accounts.setFavorite(actor.id, id, false); }

  @Post('listens') @HttpCode(200) @Header('Cache-Control', 'private, no-store')
  @Throttle({ default: { limit: env.throttle.listenLimit, ttl: env.throttle.ttlMs } })
  @ApiOkResponse({ type: ListenResult }) @ApiStandardErrors({ authenticated: true, notFound: true, rateLimited: true })
  listen(@CurrentActor() actor: Actor, @Body() dto: RecordAccountListenDto) { return this.accounts.recordListen(actor.id, dto); }
}
