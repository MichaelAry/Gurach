import { MediaAccessMiddleware } from './file/media-access.middleware.js';
import { BoundaryThrottlerGuard } from './auth/boundary-throttler.guard.js';
import { PlaylistsModule } from './playlists/playlists.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { HomeModule } from './home/home.module.js';
import { FriendsModule } from './friends/friends.module.js';
import { UsersModule } from './users/users.module.js';
import { AccountModule } from './account/account.module.js';
import { QueueModule } from './queue/queue.module.js';
import { Module, type NestModule, type MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import { env } from './common/env.js';
import { TrackModule } from './track/track.module.js';
import { HealthModule } from './health/health.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { CommentModule } from './comment/comment.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [PlaylistsModule, NotificationsModule,
    HomeModule,
    AccountModule,
    FriendsModule,
    UsersModule,
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
      serveStaticOptions: { cacheControl: false, etag: false, lastModified: false, index: false },
    }),
    // Глобальный rate limit: по умолчанию 100 запросов/мин на IP.
    // На конкретных эндпоинтах поверх ставится @Throttle(...) —
    // см. POST /tracks/:id/listen в track.controller.ts.
    ThrottlerModule.forRoot([
      { ttl: env.throttle.ttlMs, limit: env.throttle.limit },
    ]),
  ],
  providers: [{ provide: APP_GUARD, useClass: BoundaryThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MediaAccessMiddleware).forRoutes('static/{*path}');
  }
}
