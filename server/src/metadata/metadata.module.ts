import { Module } from '@nestjs/common';
import { ArtworkProvider } from './artwork.provider.js';
import { LastFmProvider } from './lastfm.provider.js';
import { MetadataController } from './metadata.controller.js';
import { MetadataService } from './metadata.service.js';
import { MusicBrainzProvider } from './musicbrainz.provider.js';

@Module({
  controllers: [MetadataController],
  providers: [MetadataService, ArtworkProvider, LastFmProvider, MusicBrainzProvider],
})
export class MetadataModule {}
