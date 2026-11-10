export const FILE_POLICY = Object.freeze({
  maxAudioBytes: 50 * 1024 * 1024,
  maxCoverBytes: 10 * 1024 * 1024,
  maxCoverPixels: 40_000_000,
  maxRequestFiles: 2,
  maxBodyFields: 4,
  maxFieldNameChars: 32,
  maxTitleChars: 200,
  maxArtistChars: 200,
  maxLyricsChars: 100_000,
  maxDurationChars: 32,
  maxConcurrentProbes: 2,
  maxConcurrentUploads: 2,
  probeTimeoutMs: 10_000,
  maxProbeOutputBytes: 1024 * 1024,
  maxAnimatedCoverPages: 100,
});

export type MediaKind = 'audio' | 'picture';

export const AUDIO_EXTENSIONS = Object.freeze(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac'] as const);
export const COVER_EXTENSIONS = Object.freeze(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'] as const);

const AUDIO_MIME_BY_EXTENSION: Readonly<Record<(typeof AUDIO_EXTENSIONS)[number], string>> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
};

const COVER_MIME_BY_EXTENSION: Readonly<Record<(typeof COVER_EXTENSIONS)[number], string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
};

export function normalizeMediaExtension(extension: string): string {
  const normalized = extension.trim().toLowerCase().replace(/^\./, '');
  if (normalized === 'jpeg') return 'jpg';
  if (normalized === 'oga') return 'ogg';
  return normalized;
}

export function allowedExtension(kind: MediaKind, extension: string): boolean {
  const normalized = normalizeMediaExtension(extension);
  return kind === 'audio'
    ? AUDIO_EXTENSIONS.some((candidate) => normalizeMediaExtension(candidate) === normalized)
    : COVER_EXTENSIONS.some((candidate) => normalizeMediaExtension(candidate) === normalized);
}

export function canonicalMimeType(kind: MediaKind, extension: string): string | undefined {
  const normalized = extension.trim().toLowerCase().replace(/^\./, '') as keyof typeof AUDIO_MIME_BY_EXTENSION;
  if (kind === 'audio') return AUDIO_MIME_BY_EXTENSION[normalized];
  const coverExtension = normalized as keyof typeof COVER_MIME_BY_EXTENSION;
  return COVER_MIME_BY_EXTENSION[coverExtension];
}

export function assertMediaSize(kind: MediaKind, size: number): void {
  const maximum = kind === 'audio' ? FILE_POLICY.maxAudioBytes : FILE_POLICY.maxCoverBytes;
  if (!Number.isSafeInteger(size) || size <= 0 || size > maximum) {
    throw new Error(`${kind === 'audio' ? 'Audio' : 'Cover'} file must be non-empty and no larger than ${maximum} bytes`);
  }
}

export function validateUploadFields(fields: Record<string, unknown>): void {
  const entries = Object.entries(fields);
  if (entries.length > FILE_POLICY.maxBodyFields) throw new Error('Too many multipart fields');
  for (const [name, value] of entries) {
    if (name.length > FILE_POLICY.maxFieldNameChars) throw new Error('Multipart field name is too long');
    if (Array.isArray(value)) throw new Error(`Multipart field ${name} must occur once`);
    if (typeof value !== 'string') throw new Error(`Multipart field ${name} must be text`);
    const maximum = name === 'name' ? FILE_POLICY.maxTitleChars
      : name === 'artist' ? FILE_POLICY.maxArtistChars
        : name === 'text' ? FILE_POLICY.maxLyricsChars
          : name === 'duration' ? FILE_POLICY.maxDurationChars
            : 0;
    if (maximum === 0) throw new Error(`Unexpected multipart field: ${name}`);
    if (value.length > maximum) throw new Error(`Multipart field ${name} is too long`);
  }
}
