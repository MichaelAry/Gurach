import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { CreateTrackDto } from './dto/create-track.dto.js';
import { TrackService } from './track.service.js';

@Controller('/tracks')
export class TrackController {
  constructor(private trackService: TrackService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'picture', maxCount: 1 },
      { name: 'audio', maxCount: 1 },
    ]),
  )
  create(
    @Body() dto: CreateTrackDto,
    @UploadedFiles()
    files: {
      picture?: Express.Multer.File[];
      audio?: Express.Multer.File[];
    },
  ) {
    const { picture, audio } = files;

    if (!picture?.[0] || !audio?.[0]) {
      throw new BadRequestException('picture and audio are required');
    }

    return this.trackService.create(dto, picture[0], audio[0]);
  }

  @Get()
  getAll(@Query('count') count?: string, @Query('offset') offset?: string) {
    return this.trackService.getAll(
      count !== undefined ? Number(count) : undefined,
      offset !== undefined ? Number(offset) : undefined,
    );
  }

  private toNumber(value?: string): number | undefined {
    return value !== undefined ? Number(value) : undefined;
  }

  @Get('search')
  search(
    @Query('query') query?: string,
    @Query('name') name?: string,
    @Query('artist') artist?: string,
    @Query('text') text?: string,
    @Query('count') count?: string,
    @Query('offset') offset?: string,
  ) {
    return this.trackService.search(
      { query, name, artist, text },
      this.toNumber(count),
      this.toNumber(offset),
    );
  }

  @Post('comments')
  addComment(@Body() dto: CreateCommentDto) {
    return this.trackService.addComment(dto);
  }

  @Get('comments')
  getAllComments(@Query('trackId') trackId?: string) {
    return this.trackService.getAllComments(trackId);
  }

  @Delete('comments/:id')
  deleteComment(@Param('id') id: string) {
    return this.trackService.deleteComment(id);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.trackService.getOne(id);
  }

  @Delete(':id')
  deleteOne(@Param('id') id: string) {
    return this.trackService.deleteOne(id);
  }

  @Post('/:id/listen')
  listen(@Param('id') id: string) {
    return this.trackService.listen(id);
  }
}
