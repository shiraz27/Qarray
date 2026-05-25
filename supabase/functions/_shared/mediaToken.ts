// Deno copy of src/utils/mediaToken.ts — kept in sync manually because edge
// functions can't import from the src/ tree. Used by upload-to-archive,
// fetch-media, delete-from-archive, and any other function that needs to
// translate between opaque `arc1://` tokens and the underlying storage URL.

const ARCHIVE_PREFIX = 'https://archive.org/download/';
const TOKEN_PREFIX = 'arc1://';

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(s: string): string {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function isMediaToken(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(TOKEN_PREFIX);
}

export function encodeMediaUrl(input: string | null | undefined): string {
  if (!input) return '';
  if (isMediaToken(input)) return input;
  if (!input.startsWith(ARCHIVE_PREFIX)) return input;
  return TOKEN_PREFIX + toBase64Url(input.slice(ARCHIVE_PREFIX.length));
}

export function decodeMediaToken(token: string | null | undefined): string | null {
  if (!token || !isMediaToken(token)) return null;
  try {
    return ARCHIVE_PREFIX + fromBase64Url(token.slice(TOKEN_PREFIX.length));
  } catch {
    return null;
  }
}

/**
 * Resolve a value that may be a token, a raw archive URL, or some other
 * absolute URL into a real fetchable URL. Returns null if it can't be
 * resolved (e.g. invalid token).
 */
export function resolveToFetchUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isMediaToken(value)) return decodeMediaToken(value);
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return null;
}

/** Short non-reversible prefix for logging without leaking the storage URL. */
export function logSafeRef(value: string | null | undefined): string {
  if (!value) return '<empty>';
  if (isMediaToken(value)) return value.slice(0, 16) + '…';
  // Hash a substring for legacy raw URLs so logs don't leak the host.
  return 'raw:' + value.length;
}