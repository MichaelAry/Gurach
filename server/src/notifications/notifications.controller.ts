import { Controller, Get, HttpCode, Param, Put, Query, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentActor } from '../auth/session.guard.js';
import type { Actor } from '../auth/session.service.js';
import { ApiStandardErrors } from '../contracts/api-response.decorators.js';
import { ListNotificationsDto, NotificationsPage, UnreadNotifications } from './notifications.contract.js';
import { NotificationsService } from './notifications.service.js';

@SetMetadata('gurach.private', true)
@Controller('notifications')
@ApiTags('notifications')
@ApiBearerAuth()
@ApiStandardErrors({ authenticated: true, notFound: true, rateLimited: true })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() @ApiOkResponse({ type: NotificationsPage })
  list(@CurrentActor() actor: Actor, @Query() query: ListNotificationsDto) { return this.notifications.list(actor.id, query); }
  @Get('unread-count') @ApiOkResponse({ type: UnreadNotifications })
  unread(@CurrentActor() actor: Actor) { return this.notifications.unread(actor.id); }
  @Put(':id/read') @HttpCode(204) @ApiNoContentResponse()
  read(@CurrentActor() actor: Actor, @Param('id') id: string) { return this.notifications.markRead(actor.id, id); }
}
