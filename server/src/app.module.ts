import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TrackModule } from './track/track.module.js';
@Module({
  imports: [
    TrackModule,
    MongooseModule.forRoot(
      'mongodb://michael:1111@localhost:27017/nest?authSource=admin',
    ),
  ],
})
export class AppModule {}
