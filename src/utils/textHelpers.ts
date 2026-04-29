/**
 * Cheap text normalization shared across the app.
 *
 * Use for accent/case/article-insensitive client-side matching
 * (autocomplete filters, in-memory search, icon mapping, etc.).
 *
 * For database queries, prefer the `search_*_normalized` RPCs which
 * apply the same normalization on the server side via `unaccent()`.
 */
export const normalizeText = (s: string | null | undefined): string =>
  (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/^(l['’]|d['’]|le |la |les |un |une |des |de |du )/i, '')
    .replace(/['’`]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** True when `needle` appears in `haystack` after normalizing both sides. */
export const normalizedIncludes = (
  haystack: string | null | undefined,
  needle: string | null | undefined,
): boolean => {
  const n = normalizeText(needle);
  if (!n) return true;
  return normalizeText(haystack).includes(n);
};

/** Capitalize the first letter of each word, preserving the rest. */
export const capitalizeEveryWord = (s: string | null | undefined): string =>
  (s ?? '')
    .toString()
    .replace(/\b\p{L}/gu, (ch) => ch.toUpperCase());
