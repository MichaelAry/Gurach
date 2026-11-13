import type { Actor } from '../auth/session.service.js';
import { TrackReadService } from './track-read.service.js';
import { ResolveTracksDto, ResolveTracksResponse } from './dto/resolve-tracks.dto.js';
import { Public, CurrentActor } from '../auth/session.guard.js';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Param,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiAcceptedResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  DeletionAccepted,
  ListenResult,
  PlayableTrack,
  TrackDetail,
  TrackListPage,
  TrackSearchPage,
} from '../contracts/track.contract.js';
import { ApiErrorDto } from '../contracts/api-error.dto.js';
import { ApiStandardErrors } from '../contracts/api-response.decorators.js';
import { env } from '../common/env.js';
import { parseCursorPageQuery } from './dto/list-tracks-query.dto.js';
import { parseSearchTracksQuery } from './dto/search-tracks-query.dto.js';
import { CreateTrackDto } from './dto/create-track.dto.js';
import { TrackService } from './track.service.js';
import { UploadAdmissionGuard } from '../file/upload-admission.guard.js';
import { UploadStagingInterceptor } from './upload-staging.interceptor.js';
import type { Request } from 'express';
import { UPLOAD_RESERVATION, type UploadRequestContext } from '../file/upload-reservation.js';

@Controller('/tracks')
@ApiTags('tracks')
export class TrackController {
  constructor(private trackService: TrackService, private readonly trackReader: TrackReadService) {}

  @Public()
  @Get('random')
  @ApiOkResponse({ type: [PlayableTrack] })
  @ApiStandardErrors()
  random() { return this.trackReader.random(); }

  @Public()
  @Post('resolve')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOkResponse({ type: ResolveTracksResponse })
  @ApiStandardErrors({ rateLimited: true, payloadTooLarge: true })
  async resolve(@Body() dto: ResolveTracksDto): Promise<ResolveTracksResponse> {
    const ids = dto.ids.map((id) => id.toLowerCase());
    const tracks = await this.trackReader.resolve(ids);
    return { items: ids.map((trackId) => {
      const track = tracks.get(trackId) ?? null;
      return { trackId, track, availability: track?.audio ? 'playable' : 'unavailable', reason: track?.audio ? null : track ? 'missing-audio' : 'deleted' };
    }) };
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: {
    type: 'object',
    required: ['name', 'picture', 'audio'],
    properties: {
      name: { type: 'string', maxLength: 200, example: 'Track title' },
      artist: { type: 'string', maxLength: 200 },
      text: { type: 'string', maxLength: 100_000, description: 'Track lyrics' },
      duration: { type: 'string', pattern: '^\\d+(?:\\.\\d+)?$', example: '180' },
      picture: { type: 'string', format: 'binary' },
      audio: { type: 'string', format: 'binary' },
    },
  } })
  @ApiCreatedResponse({ type: TrackDetail })
  @ApiServiceUnavailableResponse({ description: 'Upload protection index or media validation unavailable', type: ApiErrorDto })
  @ApiStandardErrors({ authenticated: true, payloadTooLarge: true, unsupportedMediaType: true, conflict: true, rateLimited: true })
  @UseGuards(UploadAdmissionGuard)
  @UseInterceptors(UploadStagingInterceptor)
  create(
    @Body() dto: CreateTrackDto,
    @CurrentActor() actor: Actor,
    @UploadedFiles()
    files: Record<string, Express.Multer.File[]>,
    @Req() request: Request & UploadRequestContext,
  ) {
    const { picture, audio } = files ?? {};

    if (!picture?.[0] || !audio?.[0]) {
      throw new BadRequestException('picture and audio are required');
    }
    const operationId = request[UPLOAD_RESERVATION]?.operationId;
    if (!operationId) throw new InternalServerErrorException('Upload operation reservation is missing');

    return this.trackService.create(dto, picture[0], audio[0], operationId, actor);
  }

  @Public()
  @Get()
  @ApiQuery({ name: 'count', required: false, type: Number, minimum: 1, maximum: 100, example: 20 })
  @ApiQuery({ name: 'cursor', required: false, type: String, maxLength: 512 })
  @ApiOkResponse({ type: TrackListPage })
  @ApiStandardErrors()
  getAll(@Query() query: Record<string, unknown>) {
    return this.trackService.getPage(parseCursorPageQuery(query));
  }

  @Public()
  @Get('search')
  @ApiQuery({ name: 'query', required: false, type: String, maxLength: 200 })
  @ApiQuery({ name: 'name', required: false, type: String, maxLength: 200 })
  @ApiQuery({ name: 'artist', required: false, type: String, maxLength: 200 })
  @ApiQuery({ name: 'text', required: false, type: String, maxLength: 200 })
  @ApiQuery({ name: 'count', required: false, type: Number, minimum: 1, maximum: 100, example: 20 })
  @ApiQuery({ name: 'cursor', required: false, type: String, maxLength: 512 })
  @ApiOkResponse({ type: TrackSearchPage })
  @ApiStandardErrors()
  search(@Query() query: Record<string, unknown>) {
    return this.trackService.search(parseSearchTracksQuery(query));
  }

  @Public()
  @Get(':id')
  @ApiParam({ name: 'id', schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } })
  @ApiOkResponse({ type: TrackDetail })
  @ApiStandardErrors({ notFound: true })
  getOne(@Param('id') id: string) {
    return this.trackService.getOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiParam({ name: 'id', schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } })
  @ApiAcceptedResponse({ type: DeletionAccepted })
  @ApiStandardErrors({ authenticated: true, notFound: true })
  deleteOne(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.trackService.deleteOne(id, actor);
  }

  // Жёстче глобального лимита: накрутка прослушиваний банальным спамом запросов
  // не должна быть возможна (по умолчанию 10 запросов/мин на IP).
  @Public()
  @Post('/:id/listen')
  @ApiParam({ name: 'id', schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } })
  @ApiOkResponse({ type: ListenResult })
  @ApiStandardErrors({ notFound: true, rateLimited: true })
  @Throttle({
    default: { limit: env.throttle.listenLimit, ttl: env.throttle.ttlMs },
  })
  listen(@Param('id') id: string) {
    return this.trackService.listen(id);
  }
}
