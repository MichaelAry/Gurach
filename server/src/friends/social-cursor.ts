import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
export function socialScope(actorId: string, kind: string) {
  return createHash('sha256').update(`social:${actorId}:${kind}`).digest('hex');
}
export function encodeSocialCursor(scope: string, after: string, value: string): string {
  return Buffer.from(JSON.stringify({ v: 3, scope, after, value })).toString('base64url');
}
export function decodeSocialCursor(cursor: string | undefined, scope: string): { after: string; value: string } | null {
  if (cursor === undefined) return null;
  try {
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(cursor)) throw new Error();
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.toString('base64url') !== cursor) throw new Error();
    const row = JSON.parse(bytes.toString()) as Record<string, unknown>;
    if (Object.keys(row).sort().join(',') !== 'after,scope,v,value' || row.v !== 3 || row.scope !== scope || typeof row.after !== 'string' || !/^[a-f0-9]{24}$/.test(row.after) || typeof row.value !== 'string' || row.value.length > 64) throw new Error();
    return { after: row.after, value: row.value };
  } catch { throw new BadRequestException('Invalid cursor'); }
}
