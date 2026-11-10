import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FileModule } from '../file/file.module.js';
import { Comment, CommentSchema } from '../comment/schemas/comment.schema.js';
import { Track, TrackSchema } from '../track/schemas/track.schema.js';
import { MediaOperation, MediaOperationSchema } from './schemas/media-operation.schema.js';
import { CacheEvent, CacheEventSchema } from './schemas/cache-event.schema.js';
import { MaintenanceService } from './maintenance.service.js';

@Module({
  imports: [
    FileModule,
    MongooseModule.forFeature([
      { name: Track.name, schema: TrackSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: MediaOperation.name, schema: MediaOperationSchema },
      { name: CacheEvent.name, schema: CacheEventSchema },
    ]),
  ],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
