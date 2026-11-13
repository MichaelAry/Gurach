import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Track, TrackSchema } from '../track/schemas/track.schema.js';
import { Comment, CommentSchema } from '../comment/schemas/comment.schema.js';
import {
  AccountListen,
  AccountListenSchema,
} from '../account/listen.schema.js';
import {
  SocialRelation,
  SocialRelationSchema,
} from '../friends/schemas/social-relation.schema.js';
import { User, UserSchema } from '../auth/schemas/user.schema.js';
import { TrackModule } from '../track/track.module.js';
import { HOME_API_CONTROLLERS } from '../contracts/api-controller.registry.js';
import { HomeService } from './home.service.js';
@Module({
  imports: [
    TrackModule,
    MongooseModule.forFeature([
      { name: Track.name, schema: TrackSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: AccountListen.name, schema: AccountListenSchema },
      { name: SocialRelation.name, schema: SocialRelationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [...HOME_API_CONTROLLERS],
  providers: [HomeService],
})
export class HomeModule {}
