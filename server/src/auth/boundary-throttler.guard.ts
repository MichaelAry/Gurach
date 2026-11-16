import { SessionService } from './session.service.js';
import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { ActorRequest } from './session.guard.js';
import { env } from '../common/env.js';

@Injectable()
export class BoundaryThrottlerGuard extends ThrottlerGuard {
  @Inject(SessionService) private readonly sessions: SessionService;
  protected async getTracker(request: Record<string, unknown>): Promise<string> {
    const req = request as unknown as ActorRequest;
    const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '');
    if (!req.actor && bearer) {
      try { req.actor = (await this.sessions.authenticate(bearer[1])).user; } catch { /* Invalid tokens share the peer limit. */ }
    }
    if (req.actor) return `account:${req.actor.id}`;
    const signed = req.headers['x-gurach-boundary'];
    if (env.proxySecret && typeof signed === 'string') {
      const [timestamp, ip, signature] = signed.split('|');
      if (/^\d{13}$/.test(timestamp) && Math.abs(Date.now() - Number(timestamp)) < 30000 && isIP(ip)
        && /^[a-f0-9]{64}$/.test(signature ?? '')) {
        const expected = createHmac('sha256', env.proxySecret).update(`${timestamp}|${ip}`).digest();
        if (timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return `ip:${ip}`;
      }
    }
    // Express trust proxy remains disabled. Never inspect X-Forwarded-For.
    return `peer:${req.socket?.remoteAddress ?? 'unknown'}`;
  }
}
