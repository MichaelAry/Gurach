/** Comparison keys only: never use these values as display metadata. */
export function normalizeTrackIdentity(value?: string | null): string {
  return (value ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
}
