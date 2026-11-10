import { Public } from '../auth/session.guard.js';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorDto } from '../contracts/api-error.dto.js';
import type { Connection } from 'mongoose';

@Controller('health')
@ApiTags('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Public()
  @Get('live')
  @ApiOkResponse({ schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } } } })
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @ApiOkResponse({ schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } } } })
  @ApiServiceUnavailableResponse({ description: 'Dependency unavailable', type: ApiErrorDto })
  async ready() {
    try {
      const hello = await this.connection.db?.admin().command({ hello: 1 });
      if (!hello || hello.isWritablePrimary !== true || typeof hello.setName !== 'string') {
        throw new Error('MongoDB must be a writable replica set primary for transactions');
      }
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
  }
}
