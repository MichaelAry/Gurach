import { extname, join } from 'node:path';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Types, type Connection } from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../common/env.js';
import { coverThumbnail, COVER_THUMBNAIL_SIZES } from './cover-thumbnail.js';

@Injectable()
export class MediaAccessMiddleware implements NestMiddleware {
  constructor(@InjectConnection() private readonly connection: Connection) {}
  async use(request: Request, response: Response, next: NextFunction) {
    response.setHeader('Cache-Control', 'private, no-store');
    // Apply to GET, HEAD and Range alike, before the static-file adapter.
    const match = /^\/static\/(audio|picture)\/([a-zA-Z0-9._-]+)$/.exec(request.originalUrl.split('?')[0]);
    if (!match) { response.sendStatus(404); return; }
    const field = match[1] === 'audio' ? 'audio' : 'picture';
    try {
      const tracks = this.connection.collection('tracks');
      if (await tracks.findOne({ [field]: match[2], moderationRemovedAt: { $exists: true } }, { projection: { _id: 1 } })
        || !await tracks.findOne({ [field]: match[2], lifecycle: 'active' }, { projection: { _id: 1 } })) {
        response.sendStatus(404); return;
      }
      if (field === 'audio' && request.query.download !== undefined) {
        const id = request.query.download;
        if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) {
          response.sendStatus(400); return;
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.sendStatus(405); return;
        }
        const track = await tracks.findOne(
          { _id: new Types.ObjectId(id), audio: match[2], lifecycle: 'active' },
          { projection: { name: 1, artist: 1 } },
        );
        if (!track || match[2].startsWith('.')) { response.sendStatus(404); return; }
        const title = [track.name, track.artist]
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim().replace(/[. ]+$/, ''))
          .filter(Boolean)
          .join(' - ');
        const filename = (title || 'track') + extname(match[2]);
        response.download(match[2], filename, {
          root: join(env.staticDir, 'audio'), cacheControl: false, lastModified: false,
        }, (error) => {
          if (!error) return;
          if (response.headersSent) {
            response.destroy();
            return;
          }
          response.removeHeader('Content-Disposition');
          const status = 'status' in error ? error.status : undefined;
          response.sendStatus(typeof status === 'number' && status >= 400 && status < 500 ? status : 503);
        });
        return;
      }
      if (field === 'picture' && request.query.size !== undefined) {
        const size = request.query.size;
        if (typeof size !== 'string' || !COVER_THUMBNAIL_SIZES.some((value) => String(value) === size)) {
          response.sendStatus(400); return;
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') { response.sendStatus(405); return; }
        const thumbnail = await coverThumbnail(env.staticDir, match[2], Number(size));
        response.setHeader('Content-Type', 'image/webp');
        response.setHeader('Content-Length', thumbnail.length);
        response.end(request.method === 'HEAD' ? undefined : thumbnail);
        return;
      }
      next();
    } catch { response.sendStatus(503); }
  }
}
