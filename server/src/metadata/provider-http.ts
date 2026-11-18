export async function boundedProviderBody(response: Response, limit: number): Promise<Buffer> {
  if (!response.body || Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('Invalid provider body size');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Provider body exceeds size limit');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export async function providerJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Provider unavailable');
  }
  return JSON.parse((await boundedProviderBody(response, 2 * 1024 * 1024)).toString('utf8')) as T;
}

export function retryAfter(value: string | null): number {
  if (!value) return 1000;
  const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(1000, delay) : 1000;
}
