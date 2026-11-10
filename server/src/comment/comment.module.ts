import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Comment, CommentSchema } from './schemas/comment.schema.js';
import { CommentService } from './comment.service.js';
import { TrackModule } from '../track/track.module.js';
import { COMMENT_API_CONTROLLERS } from '../contracts/api-controller.registry.js';

@Module({
  imports: [TrackModule, MongooseModule.forFeature([{ name: Comment.name, schema: CommentSchema }])],
  controllers: [...COMMENT_API_CONTROLLERS],
  providers: [CommentService],
})
export class CommentModule {}
