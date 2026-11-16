import { verifyPlatformIndexes } from '../scripts/migrations/012-controlled-registration.js';
import { isDeepStrictEqual } from 'node:util';
import type { Schema } from 'mongoose';
import { CacheEventSchema } from '../maintenance/schemas/cache-event.schema.js';
import { MediaOperationSchema } from '../maintenance/schemas/media-operation.schema.js';
import { createTargetFingerprint } from '../scripts/lib/migration-context.js';
import { CommentSchema } from '../comment/schemas/comment.schema.js';
import { UserSchema } from '../auth/schemas/user.schema.js';
import { SessionSchema } from '../auth/schemas/session.schema.js';
import { QueueSchema } from '../queue/schemas/queue.schema.js';
import { TrackSchema } from '../track/schemas/track.schema.js';
import { migrationDefinitions } from '../scripts/migrations/registry.js';
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
      const db = this.connection.db!;
      const schemas: [string, Schema][] = [
        ['tracks', TrackSchema], ['comments', CommentSchema], ['users', UserSchema],
        ['sessions', SessionSchema], ['queues', QueueSchema],
        ['mediaoperations', MediaOperationSchema], ['cacheevents', CacheEventSchema],
      ];
      for (const [collection, schema] of schemas) {
        const indexes = await db.collection(collection).listIndexes().toArray();
        for (const [key, options] of schema.indexes()) {
          if (!indexes.some(index => index.name === options.name && isDeepStrictEqual(Object.entries(index.key), Object.entries(key)) &&
              Boolean(index.unique) === Boolean(options.unique) &&
              isDeepStrictEqual(index.partialFilterExpression, options.partialFilterExpression) &&
              index.expireAfterSeconds === options.expireAfterSeconds &&
              !index.collation && !index.sparse && !index.hidden)) throw new Error('Critical index unavailable');
        }
      }
      if (await verifyPlatformIndexes(db)) throw new Error('Platform indexes unavailable');
      const fingerprint = createTargetFingerprint(db.databaseName, hello);
      for (const migration of migrationDefinitions) {
        const state = await db.collection('_gurach_migration_state').findOne({ _id: migration.id as never });
        if (state?.status !== 'completed' || state.migrationVersion !== migration.version ||
            state.targetFingerprint !== fingerprint) throw new Error('Schema migration incomplete');
        // Index-only migrations perform bounded metadata reads; no runtime DDL.
        if (['004-auth-indexes', '006-queue-indexes', '007-social-relations', '009-audio-fingerprint-indexes', '010-notification-indexes', '011-playlist-indexes'].includes(migration.id) &&
            (await migration.verify(db, 100)).issueCount !== 0) throw new Error('Critical index unavailable');
      }
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
  }
}
