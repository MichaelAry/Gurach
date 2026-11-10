import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../auth/schemas/user.schema.js';
import { SocialRelation, SocialRelationSchema } from './schemas/social-relation.schema.js';
import { FriendRequestCounter, FriendRequestCounterSchema } from './schemas/friend-request-counter.schema.js';
import { FriendsService } from './friends.service.js';
import { FriendsController } from './friends.controller.js';
@Module({
  imports: [MongooseModule.forFeature([
    { name: User.name, schema: UserSchema }, { name: SocialRelation.name, schema: SocialRelationSchema },
    { name: FriendRequestCounter.name, schema: FriendRequestCounterSchema },
  ])], providers: [FriendsService], controllers: [FriendsController], exports: [FriendsService],
})
export class FriendsModule {}
