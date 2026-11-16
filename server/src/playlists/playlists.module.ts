import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TrackModule } from '../track/track.module.js';
import { Playlist, PlaylistSchema } from './playlist.schema.js';
import { PlaylistsService } from './playlists.service.js';
import { PlaylistsController } from './playlists.controller.js';
@Module({ imports: [TrackModule, MongooseModule.forFeature([{ name: Playlist.name, schema: PlaylistSchema }])], providers: [PlaylistsService], controllers: [PlaylistsController] })
export class PlaylistsModule {}
