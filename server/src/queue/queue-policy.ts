import { BadRequestException } from '@nestjs/common';
export const QUEUE_CAPACITY = 100 as const;
export const QUEUE_BODY_LIMIT_BYTES = 64 * 1024;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;
export interface QueueEntryInput { entryId: string; trackId: string; source?: 'automatic' | 'manual'; }
export function validEntries(entries: unknown): entries is QueueEntryInput[] {
  if (!Array.isArray(entries) || entries.length > QUEUE_CAPACITY) return false;
  const seen = new Set<string>();
  return entries.every((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('entryId' in entry) || !('trackId' in entry) ||
      typeof entry.entryId !== 'string' || !UUID_PATTERN.test(entry.entryId) || typeof entry.trackId !== 'string' || !OBJECT_ID_PATTERN.test(entry.trackId)) return false;
    const id = entry.entryId.toLowerCase();
    if ('source' in entry && entry.source !== undefined && entry.source !== 'automatic' && entry.source !== 'manual') return false;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
export function assertQueueWrite(value: { expectedRevision: number; mutationId: string; entries: QueueEntryInput[] }): void {
  if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0 || !UUID_PATTERN.test(value.mutationId) || !validEntries(value.entries)) {
    throw new BadRequestException('Invalid queue revision, mutation identity or entries');
  }
}
