import { Controller, Get, Query, SetMetadata } from '@nestjs/common';
import { Public, CurrentActor } from '../auth/session.guard.js';
import type { Actor } from '../auth/session.service.js';
import { HomeService } from './home.service.js';
@Controller('home')
export class HomeController {
  constructor(private readonly home: HomeService) {}
  @Public() @Get('releases') releases(@Query('cursor') cursor?: string) {
    return this.home.releases(cursor);
  }
  @Public() @Get('popular') popular() {
    return this.home.popular();
  }
  @SetMetadata('gurach.private', true)
  @Get('activity')
  activity(@CurrentActor() actor: Actor, @Query('cursor') cursor?: string) {
    return this.home.activity(actor.id, cursor);
  }
}
