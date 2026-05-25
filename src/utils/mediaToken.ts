/**
 * Opaque media token encoding.
 *
 * Real storage URLs (Archive.org download links) are never exposed to clients,
 * DB rows, or DOM attributes. Instead we use opaque `arc1://<base64url>` tokens
 * that round-trip to the underlying path through `encodeMediaUrl` /
 * `decodeMediaToken`.
 *
 * The token format is intentionally reversible (obfuscation, not encryption).
 * Anyone reading our source can decode — the goal is to keep the storage
 * provider out of network traces, the database, and rendered HTML.
 */

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

/** True if the string is an opaque media token. */
export function isMediaToken(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(TOKEN_PREFIX);
}

/**
 * Encode a raw storage URL into an opaque token. Non-archive inputs (YouTube,
 * data URLs, existing tokens) are returned unchanged so this is safe to apply
 * everywhere.
 */
export function encodeMediaUrl(input: string | null | undefined): string {
  if (!input) return '';
  if (isMediaToken(input)) return input;
  if (!input.startsWith(ARCHIVE_PREFIX)) return input;
  const path = input.slice(ARCHIVE_PREFIX.length);
  return TOKEN_PREFIX + toBase64Url(path);
}

/**
 * Decode an opaque token back into its real storage URL.
 * Returns null for non-tokens.
 */
export function decodeMediaToken(token: string | null | undefined): string | null {
  if (!token || !isMediaToken(token)) return null;
  try {
    const path = fromBase64Url(token.slice(TOKEN_PREFIX.length));
    return ARCHIVE_PREFIX + path;
  } catch {
    return null;
  }
}

/**
 * Return the decoded *path* portion (without the storage prefix) for type
 * detection on tokens. For non-tokens, returns the input. Used by URL-classifier
 * helpers so existing `-pdf` / `-png` regex logic keeps working on tokens.
 */
export function tokenInnerPath(value: string | null | undefined): string {
  if (!value) return '';
  if (!isMediaToken(value)) return value;
  try {
    return fromBase64Url(value.slice(TOKEN_PREFIX.length));
  } catch {
    return value;
  }
}

/**
 * Build the proxy `src=` URL for an opaque token (or pass-through for non-archive
 * URLs like YouTube). Use this everywhere we previously hard-coded `archive.org`
 * URLs in `<img>`, `<a>`, `<audio>`, `<video>` tags.
 */
export function mediaSrc(value: string | null | undefined): string {
  if (!value) return '';
  // Non-archive URLs (YouTube, etc.) pass through unchanged.
  if (!isMediaToken(value) && !value.startsWith(ARCHIVE_PREFIX)) return value;
  const token = isMediaToken(value) ? value : encodeMediaUrl(value);
  const base = import.meta.env.VITE_SUPABASE_URL;
  return `${base}/functions/v1/fetch-media?token=${encodeURIComponent(token)}`;
}

/** Rewrite any raw archive URLs inside a text blob to opaque tokens. */
export function encodeAllInText(text: string): string {
  if (!text) return text;
  return text.replace(/https:\/\/archive\.org\/download\/[^\s\n"')<>]+/g, (m) =>
    encodeMediaUrl(m),
  );
}