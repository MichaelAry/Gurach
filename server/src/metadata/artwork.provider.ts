import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { FILE_POLICY, COVER_EXTENSIONS, canonicalMimeType } from '../file/file-policy.js';
import { boundedProviderBody } from './provider-http.js';

const coverTypes = new Set(COVER_EXTENSIONS.map((ext) => canonicalMimeType('picture', ext)));
function archiveUrl(url: URL): boolean {
  return url.protocol === 'https:' && !url.port && !url.username && !url.password && (
    url.hostname === 'coverartarchive.org' || url.hostname === 'archive.org'
    || /^(?:ia\d+|www)\.archive\.org$/.test(url.hostname)
    || /^ia\d+\.us\.archive\.org$/.test(url.hostname)
  );
}

@Injectable()
export class ArtworkProvider {
  async get(releaseMbid: string, parent: AbortSignal) {
    const signal = AbortSignal.any([parent, AbortSignal.timeout(4000)]);
    let url = new URL(`https://coverartarchive.org/release/${releaseMbid}/front-500`);
    try {
      for (let hop = 0; hop <= 4 && archiveUrl(url); hop++) {
        const response = await fetch(url, { signal, redirect: 'manual' });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get('location');
          if (!location) break;
          url = new URL(location, url);
          continue;
        }
        const type = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
        if (!response.ok || !type || !coverTypes.has(type)) {
          await response.body?.cancel();
          if (response.status === 404) throw new NotFoundException('Release artwork not found');
          break;
        }
        const bytes = await boundedProviderBody(response, FILE_POLICY.maxCoverBytes);
        if (bytes.length) return { bytes, type };
        break;
      }
    } catch (error) {
      if (error instanceof NotFoundException || parent.aborted) throw error;
    }
    throw new ServiceUnavailableException('Cover Art Archive unavailable');
  }
}
