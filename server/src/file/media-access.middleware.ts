import { Injectable, type NestMiddleware } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { Request, Response, NextFunction } from 'express';

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
      next();
    } catch { response.sendStatus(503); }
  }
}
