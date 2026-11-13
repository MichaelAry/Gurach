import { Controller, Get, Header, Query, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public, CurrentActor } from '../auth/session.guard.js';
import type { Actor } from '../auth/session.service.js';
import { ApiStandardErrors } from '../contracts/api-response.decorators.js';
import { parseCursorPageQuery } from '../track/dto/list-tracks-query.dto.js';
import { HomeActivityPage, HomePopularResponse, HomeReleasesPage } from './home.contract.js';
import { HomeService } from './home.service.js';

@Controller('home')
@ApiTags('home')
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Public()
  @Get('releases')
  @ApiQuery({ name: 'cursor', required: false, type: String, minLength: 1, maxLength: 512 })
  @ApiOkResponse({ type: HomeReleasesPage })
  @ApiStandardErrors()
  releases(@Query() query: Record<string, unknown>) {
    const { cursor } = parseCursorPageQuery(query, { allowedParams: ['cursor'] });
    return this.home.releases(cursor);
  }

  @Public()
  @Get('popular')
  @ApiOkResponse({ type: HomePopularResponse })
  @ApiStandardErrors()
  popular(@Query() query: Record<string, unknown>) {
    parseCursorPageQuery(query, { allowedParams: [] });
    return this.home.popular();
  }

  @SetMetadata('gurach.private', true)
  @Get('activity')
  @Header('Cache-Control', 'private, no-store')
  @ApiBearerAuth()
  @ApiQuery({ name: 'cursor', required: false, type: String, minLength: 1, maxLength: 512 })
  @ApiOkResponse({ type: HomeActivityPage, headers: { 'Cache-Control': { schema: { type: 'string', enum: ['private, no-store'] } } } })
  @ApiStandardErrors({ authenticated: true })
  activity(@CurrentActor() actor: Actor, @Query() query: Record<string, unknown>) {
    const { cursor } = parseCursorPageQuery(query, { allowedParams: ['cursor'] });
    return this.home.activity(actor.id, cursor);
  }
}
