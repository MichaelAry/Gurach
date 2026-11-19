import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Req, Res, SetMetadata, StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOkResponse, ApiParam, ApiProduces, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiStandardErrors } from '../contracts/api-response.decorators.js';
import { MBID } from '../contracts/catalog-metadata.js';
import { ArtworkProvider } from './artwork.provider.js';
import { MetadataDetailsDto, MetadataDetailsResponse, MetadataSearchDto, MetadataSearchResponse } from './metadata.contract.js';
import { MetadataService } from './metadata.service.js';

async function untilDisconnected<T>(response: Response, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const close = () => controller.abort();
  response.once('close', close);
  try {
    if (response.destroyed) controller.abort();
    return await run(controller.signal);
  } finally {
    response.off('close', close);
  }
}

function validateKeys(request: Request, keys: string[]) {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)
    || Object.keys(request.body).some((key) => !keys.includes(key))) {
    throw new BadRequestException('Unexpected metadata lookup field');
  }
}

@Controller('metadata')
@ApiTags('metadata')
@SetMetadata('gurach.private', true)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@ApiServiceUnavailableResponse()
export class MetadataController {
  constructor(private readonly metadata: MetadataService, private readonly artworkProvider: ArtworkProvider) {}

  @Post('search')
  @HttpCode(200)
  @ApiOkResponse({ type: MetadataSearchResponse })
  @ApiStandardErrors({ authenticated: true, rateLimited: true, payloadTooLarge: true })
  search(@Body() dto: MetadataSearchDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    validateKeys(request, ['name', 'artist', 'durationMs', 'source']);
    return untilDisconnected(response, (signal) => this.metadata.search(dto, signal));
  }

  @Post('details')
  @HttpCode(200)
  @ApiOkResponse({ type: MetadataDetailsResponse })
  @ApiStandardErrors({ authenticated: true, rateLimited: true, payloadTooLarge: true })
  details(@Body() dto: MetadataDetailsDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    validateKeys(request, ['recordingMbid', 'releaseMbid', 'source', 'catalogId', 'name', 'artist', 'lastfm']);
    return untilDisconnected(response, (signal) => this.metadata.details(dto, signal));
  }

  @Get('artwork/:releaseMbid')
  @ApiParam({ name: 'releaseMbid', schema: { type: 'string', format: 'uuid' } })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiStandardErrors({ authenticated: true, rateLimited: true, notFound: true })
  async artwork(@Param('releaseMbid') id: string, @Res({ passthrough: true }) response: Response) {
    if (!MBID.test(id)) throw new BadRequestException('Invalid release UUID');
    const { bytes, type } = await untilDisconnected(response, (signal) => this.artworkProvider.get(id.toLowerCase(), signal));
    return new StreamableFile(bytes, { type, length: bytes.length });
  }
}
