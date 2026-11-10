import { TrackReadService } from './track-read.service.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FileModule } from '../file/file.module.js';
import { Track, TrackSchema } from './schemas/track.schema.js';
import { TRACK_API_CONTROLLERS } from '../contracts/api-controller.registry.js';
import { TrackService } from './track.service.js';
import { TrackAccessService } from './track-access.service.js';
import { UploadAdmissionService } from '../file/upload-admission.service.js';
import { UploadAdmissionGuard } from '../file/upload-admission.guard.js';
import { UploadStagingInterceptor } from './upload-staging.interceptor.js';
import { MediaOperation, MediaOperationSchema } from '../maintenance/schemas/media-operation.schema.js';
import { CacheEvent, CacheEventSchema } from '../maintenance/schemas/cache-event.schema.js';

@Module({
  imports: [
    FileModule,
    MongooseModule.forFeature([
      { name: Track.name, schema: TrackSchema },
      { name: MediaOperation.name, schema: MediaOperationSchema },
      { name: CacheEvent.name, schema: CacheEventSchema },
    ]),
  ],
  controllers: [...TRACK_API_CONTROLLERS],
  providers: [TrackReadService, TrackService, TrackAccessService, UploadAdmissionService, UploadAdmissionGuard, UploadStagingInterceptor],
  exports: [TrackAccessService, TrackReadService],
})
export class TrackModule {}
