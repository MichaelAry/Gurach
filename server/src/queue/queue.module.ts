import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Queue, QueueSchema } from './schemas/queue.schema.js';
import { QueueController } from './queue.controller.js';
import { QueueService } from './queue.service.js';
import { TrackModule } from '../track/track.module.js';
@Module({ imports: [TrackModule, MongooseModule.forFeature([{ name: Queue.name, schema: QueueSchema }])], controllers: [QueueController], providers: [QueueService] })
export class QueueModule {}
