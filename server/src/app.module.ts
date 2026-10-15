import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import path from 'node:path';
import { FileModule } from './file/file.module.js';
import { TrackModule } from './track/track.module.js';

const STATIC_DIR = path.resolve(
  process.env.STATIC_DIR ?? path.join(process.cwd(), 'static'),
);

/**
 * Строка подключения к MongoDB из docker-compose.yml.
 * Переопределяется переменной окружения MONGODB_URI.
 */
const MONGODB_URI =
  process.env.MONGODB_URI ??
  'mongodb://michael:1111@localhost:27017/nest?authSource=admin';

@Module({
  imports: [
    TrackModule,
    FileModule,
    MongooseModule.forRoot(MONGODB_URI),
    ServeStaticModule.forRoot({
      rootPath: STATIC_DIR,
      serveRoot: '/static',
    }),
  ],
})
export class AppModule {}
