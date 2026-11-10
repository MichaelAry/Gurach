import type { INestApplication } from '@nestjs/common';
import express from 'express';
import { QUEUE_BODY_LIMIT_BYTES } from '../queue/queue-policy.js';

export function configureBodyParsers(app: INestApplication): void {
  app.use('/queue', express.json({ limit: QUEUE_BODY_LIMIT_BYTES }));
  app.use('/tracks/resolve', express.json({ limit: QUEUE_BODY_LIMIT_BYTES }));
  // Nest detects the route-specific jsonParser above and skips its default parser.
  // Install the default explicitly so other JSON endpoints receive their bodies.
  app.use(express.json());
}
