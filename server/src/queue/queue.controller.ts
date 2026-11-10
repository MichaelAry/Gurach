import { Body, Controller, Get, Header, Put, SetMetadata } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentActor } from '../auth/session.guard.js';
import type { Actor } from '../auth/session.service.js';
import { QueueService } from './queue.service.js';
import { QueueWriteDto } from './dto/queue-write.dto.js';
import { QueueResponseDto } from './dto/queue-response.dto.js';
import { ApiStandardErrors } from '../contracts/api-response.decorators.js';
@SetMetadata('gurach.private', true)
@Controller('queue')
@ApiTags('queue')
export class QueueController {
  constructor(private readonly queues: QueueService) {}
  @Get() @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: QueueResponseDto }) @ApiStandardErrors({ authenticated: true })
  get(@CurrentActor() actor: Actor) { return this.queues.get(actor.id); }
  @Put() @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: QueueResponseDto }) @ApiStandardErrors({ authenticated: true, conflict: true, rateLimited: true, payloadTooLarge: true })
  put(@CurrentActor() actor: Actor, @Body() dto: QueueWriteDto) { return this.queues.put(actor.id, dto); }
}
