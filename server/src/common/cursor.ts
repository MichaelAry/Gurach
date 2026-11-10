export interface CursorPosition {
  after: string;
}

export interface ScopedCursorPosition extends CursorPosition {
  scope: string;
}

interface EncodedCursor {
  v: 1;
  after: string;
}

interface EncodedScopedCursor {
  v: 2;
  after: string;
  scope: string;
}

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Encode only the stable ordering position; never accept client Mongo filters. */
export function encodeCursor(position: CursorPosition): string {
  if (!OBJECT_ID_PATTERN.test(position.after)) {
    throw new TypeError('Invalid cursor position');
  }
  const payload: EncodedCursor = { v: 1, after: position.after };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(value: string): CursorPosition {
  if (
    value.length === 0 ||
    value.length > 512 ||
    !BASE64URL_PATTERN.test(value)
  ) {
    throw new TypeError('Invalid cursor');
  }

  try {
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) {
      throw new Error('Non-canonical base64url');
    }
    const json: unknown = JSON.parse(decoded.toString('utf8'));
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new Error('Cursor must be an object');
    }
    const payload = json as Record<string, unknown>;
    if (
      Object.keys(payload).length !== 2 ||
      payload.v !== 1 ||
      typeof payload.after !== 'string' ||
      !OBJECT_ID_PATTERN.test(payload.after)
    ) {
      throw new Error('Invalid cursor shape');
    }
    return { after: payload.after };
  } catch {
    throw new TypeError('Invalid cursor');
  }
}

/** A cursor scoped to a canonical filter fingerprint (search/comments). */
export function encodeScopedCursor(position: ScopedCursorPosition): string {
  if (!OBJECT_ID_PATTERN.test(position.after) || !/^[a-f0-9]{64}$/.test(position.scope)) {
    throw new TypeError('Invalid scoped cursor position');
  }
  const payload: EncodedScopedCursor = { v: 2, after: position.after, scope: position.scope };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeScopedCursor(value: string): ScopedCursorPosition {
  if (
    value.length === 0 ||
    value.length > 512 ||
    !BASE64URL_PATTERN.test(value)
  ) {
    throw new TypeError('Invalid scoped cursor');
  }

  try {
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) throw new Error('Non-canonical base64url');
    const json: unknown = JSON.parse(decoded.toString('utf8'));
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Cursor must be an object');
    const payload = json as Record<string, unknown>;
    if (
      Object.keys(payload).length !== 3 ||
      payload.v !== 2 ||
      typeof payload.after !== 'string' ||
      !OBJECT_ID_PATTERN.test(payload.after) ||
      typeof payload.scope !== 'string' ||
      !/^[a-f0-9]{64}$/.test(payload.scope)
    ) {
      throw new Error('Invalid scoped cursor shape');
    }
    return { after: payload.after, scope: payload.scope };
  } catch {
    throw new TypeError('Invalid scoped cursor');
  }
}
