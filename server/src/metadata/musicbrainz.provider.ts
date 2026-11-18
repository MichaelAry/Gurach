import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { providerJson, retryAfter } from './provider-http.js';
import { musicBrainzUserAgent } from '../common/env-validation.js';

@Injectable()
export class MusicBrainzProvider {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  // A single document and MongoDB's clock coordinate workers sharing the same egress.
  private get slots() {
    return this.connection.collection<{ _id: string; next: Date; token: string }>('metadata_provider_slots');
  }

  private async acquire(signal: AbortSignal): Promise<void> {
    const id = 'musicbrainz';
    const token = randomUUID();
    const available = { $lte: [{ $ifNull: ['$next', new Date(0)] }, '$$NOW'] };
    while (!signal.aborted) {
      const slot = await this.slots.findOneAndUpdate({ _id: id }, [{ $set: {
        token: { $cond: [available, token, '$token'] },
        next: { $cond: [available, { $add: ['$$NOW', 1050] }, '$next'] },
      } }], { upsert: true, returnDocument: 'after', timeoutMS: 1000 }).catch((error: { code?: number }) => {
        if (error.code !== 11000) throw error;
        return null;
      });
      signal.throwIfAborted();
      if (slot?.token === token) return;
      await sleep(150, undefined, { signal });
    }
    signal.throwIfAborted();
  }

  async get<T>(path: string, query: Record<string, string>, parent: AbortSignal): Promise<T> {
    const userAgent = musicBrainzUserAgent(process.env.MUSICBRAINZ_USER_AGENT);
    const url = new URL(`https://musicbrainz.org/ws/2/${path}`);
    url.search = new URLSearchParams({ ...query, fmt: 'json' }).toString();
    const queueSignal = AbortSignal.any([parent, AbortSignal.timeout(4000)]);
    await this.acquire(queueSignal);
    parent.throwIfAborted();
    const response = await fetch(url, {
      signal: AbortSignal.any([parent, AbortSignal.timeout(4000)]),
      redirect: 'error', headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    });
    if (response.status === 429 || response.status === 503) {
      const delay = retryAfter(response.headers.get('retry-after'));
      await response.body?.cancel();
      await this.slots.updateOne({ _id: 'musicbrainz' }, [{ $set: {
        next: { $max: ['$next', { $add: ['$$NOW', delay] }] },
      } }], { timeoutMS: 1000 });
      throw new Error('MusicBrainz throttled the lookup');
    }
    return providerJson<T>(response);
  }
}
