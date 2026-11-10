const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const MONGO_PROTOCOLS = new Set(['mongodb:', 'mongodb+srv:']);

export function parseSafeInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Environment variable ${name} must be a decimal integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Environment variable ${name} is outside its valid range`);
  }
  return value;
}

export function validateHttpUrl(name: string, raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Environment variable ${name} must be a valid HTTP(S) URL`);
  }
  if (
    !HTTP_PROTOCOLS.has(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Environment variable ${name} must be a valid HTTP(S) base URL without credentials, query, or fragment`);
  }
  return url;
}

export function validateMongoUri(name: string, raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Environment variable ${name} must be a valid MongoDB URI`);
  }
  if (
    !MONGO_PROTOCOLS.has(url.protocol) ||
    !url.hostname ||
    url.hash ||
    (url.protocol === 'mongodb+srv:' && url.port !== '')
  ) {
    throw new Error(`Environment variable ${name} must be a MongoDB URI using mongodb:// or mongodb+srv://`);
  }
  return raw;
}

export function redactSecrets(value: string): string {
  return value
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[REDACTED_MONGODB_URI]')
    .replace(/((?:password|passwd|pwd|secret|token)\s*[=:]\s*)[^\s&,;]+/gi, '$1[REDACTED]');
}
