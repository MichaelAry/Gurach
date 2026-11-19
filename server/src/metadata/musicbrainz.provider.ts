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

  private async acquire(id: string, interval: number, signal: AbortSignal): Promise<void> {
    const token = randomUUID();
    const available = { $lte: [{ $ifNull: ['$next', new Date(0)] }, '$$NOW'] };
    while (!signal.aborted) {
      const slot = await this.slots.findOneAndUpdate({ _id: id }, [{ $set: {
        token: { $cond: [available, token, '$token'] },
        next: { $cond: [available, { $add: ['$$NOW', interval] }, '$next'] },
      } }], { upsert: true, returnDocument: 'after', timeoutMS: 1000 }).catch((error: { code?: number }) => {
        if (error.code !== 11000) throw error;
        return null;
      });
      signal.throwIfAborted();
      if (slot?.token === token) return;
      // MongoDB decides eligibility, while its returned timestamp helps pace polling.
      const delay = slot ? slot.next.getTime() - Date.now() : 150;
      await sleep(Math.max(150, Math.min(delay, 1000)), undefined, { signal });
    }
    signal.throwIfAborted();
  }

  async get<T>(path: string, query: Record<string, string>, parent: AbortSignal): Promise<T> {
    const userAgent = musicBrainzUserAgent(process.env.MUSICBRAINZ_USER_AGENT);
    const url = new URL(`https://musicbrainz.org/ws/2/${path}`);
    url.search = new URLSearchParams({ ...query, fmt: 'json' }).toString();
    return this.request('musicbrainz', url, 1050, { 'User-Agent': userAgent }, parent);
  }

  async request<T>(source: string, url: URL, interval: number, headers: Record<string, string>, parent: AbortSignal): Promise<T> {
    const queueSignal = AbortSignal.any([parent, AbortSignal.timeout(4000)]);
    await this.acquire(source, interval, queueSignal);
    parent.throwIfAborted();
    const response = await fetch(url, {
      signal: AbortSignal.any([parent, AbortSignal.timeout(4000)]),
      redirect: 'error', headers: { ...headers, Accept: 'application/json' },
    });
    const limited = response.status === 429 || response.status === 503;
    const limit = Number(response.headers.get('x-discogs-ratelimit'));
    const headerInterval = source === 'discogs' && limit > 0 ? Math.ceil(60_000 / limit) : 0;
    const delay = limited ? retryAfter(response.headers.get('retry-after')) : 0;
    if (limited || headerInterval > interval) {
      try {
        await this.slots.updateOne({ _id: source }, [{ $set: {
          next: { $max: ['$next', { $add: ['$$NOW', Math.max(headerInterval, delay)] }] },
        } }], { timeoutMS: 1000 });
      } catch (error) {
        await response.body?.cancel().catch(() => {});
        throw error;
      }
    }
    if (limited) {
      await response.body?.cancel();
      throw new Error(source + ' throttled the lookup');
    }
    return providerJson<T>(response);
  }
}
