import { FriendsService } from '../friends/friends.service.js';
import { UsersService } from '../users/users.service.js';
import { AccountService } from '../account/account.service.js';
import { QueueService } from '../queue/queue.service.js';
import { TrackReadService } from '../track/track-read.service.js';
import { SessionService } from '../auth/session.service.js';
import { Module } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { API_CONTROLLERS } from './api-controller.registry.js';
import { TrackService } from '../track/track.service.js';
import { UploadAdmissionService } from '../file/upload-admission.service.js';
import { UploadAdmissionGuard } from '../file/upload-admission.guard.js';
import { StagingService } from '../file/staging.service.js';
import { UploadStagingInterceptor } from '../track/upload-staging.interceptor.js';
import { CommentService } from '../comment/comment.service.js';

/** Metadata-only Nest module: deliberately has no feature or infrastructure imports. */
@Module({
  controllers: [...API_CONTROLLERS],
  providers: [
    { provide: FriendsService, useValue: {} },
    { provide: UsersService, useValue: {} },
    { provide: AccountService, useValue: {} },
    { provide: TrackReadService, useValue: {} },
    { provide: QueueService, useValue: {} },
    { provide: SessionService, useValue: {} },
    { provide: TrackService, useValue: {} },
    { provide: CommentService, useValue: {} },
    { provide: getConnectionToken(), useValue: {} },
    UploadAdmissionService,
    UploadAdmissionGuard,
    UploadStagingInterceptor,
    { provide: StagingService, useValue: {} },
  ],
})
export class DocumentModule {}
