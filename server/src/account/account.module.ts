import { AccountFavorite, AccountFavoriteSchema } from './favorite.schema.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Track, TrackSchema } from '../track/schemas/track.schema.js';
import { Comment, CommentSchema } from '../comment/schemas/comment.schema.js';
import { TrackModule } from '../track/track.module.js';
import { AccountListen, AccountListenSchema } from './listen.schema.js';
import { AccountService } from './account.service.js';
import { AccountController } from './account.controller.js';

@Module({
  imports: [TrackModule, MongooseModule.forFeature([
    { name: AccountFavorite.name, schema: AccountFavoriteSchema },
    { name: AccountListen.name, schema: AccountListenSchema },
    { name: Track.name, schema: TrackSchema },
    { name: Comment.name, schema: CommentSchema },
  ])],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
