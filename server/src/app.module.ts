import { AccountModule } from './account/account.module.js';
import { QueueModule } from './queue/queue.module.js';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import { env } from './common/env.js';
import { TrackModule } from './track/track.module.js';
import { HealthModule } from './health/health.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { CommentModule } from './comment/comment.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    AccountModule,
    QueueModule,
    AuthModule,
    TrackModule,
    CommentModule,
    MaintenanceModule,
    HealthModule,
    MongooseModule.forRoot(env.mongodbUri, { autoIndex: false }),
    ServeStaticModule.forRoot({
      rootPath: env.staticDir,
      serveRoot: '/static',
    }),
    // Глобальный rate limit: по умолчанию 100 запросов/мин на IP.
    // На конкретных эндпоинтах поверх ставится @Throttle(...) —
    // см. POST /tracks/:id/listen в track.controller.ts.
    ThrottlerModule.forRoot([
      { ttl: env.throttle.ttlMs, limit: env.throttle.limit },
    ]),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
