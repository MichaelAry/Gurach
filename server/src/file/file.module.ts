import { Module } from '@nestjs/common';
import { env } from '../common/env.js';
import { FileService } from './file.service.js';
import { FFPROBE_EXECUTABLE, MediaValidatorService } from './media-validator.service.js';
import { MEDIA_PUBLIC_ROOT, MEDIA_STAGING_ROOT, StagingService } from './staging.service.js';

// Только провайдер: контроллера для file больше нет (эндпоинтов не было),
// а работа с Mongoose тут не используется — MongooseModule.forFeature([]) удалён.
@Module({
  providers: [
    FileService,
    MediaValidatorService,
    StagingService,
    { provide: FFPROBE_EXECUTABLE, useFactory: () => env.ffprobePath },
    { provide: MEDIA_STAGING_ROOT, useFactory: () => env.mediaStagingDir },
    { provide: MEDIA_PUBLIC_ROOT, useFactory: () => env.staticDir },
  ],
  exports: [FileService, MediaValidatorService, StagingService],
})
export class FileModule {}
