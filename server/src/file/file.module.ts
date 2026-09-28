import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FileController } from './file.controller.js';
import { FileService } from './file.service.js';

@Module({
  imports: [MongooseModule.forFeature([])],
  controllers: [FileController],
  providers: [FileService],
})
export class FileModule {}
