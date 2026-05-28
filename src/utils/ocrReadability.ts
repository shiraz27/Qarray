export type OcrReadability = 'high' | 'medium' | 'low' | 'unreadable';

/**
 * Heuristic readability scoring of an OCR text blob. No AI needed.
 *
 * Tiers (in order):
 *   - unreadable: very little usable content or mostly junk characters
 *   - low       : short, very high gibberish ratio, or very long average word length
 *   - medium    : decent content with some noise
 *   - high      : long, clean, mostly real letters/digits
 */
export function computeReadability(text: string | null | undefined): OcrReadability {
  const t = (text ?? '').trim();
  if (!t) return 'unreadable';

  // Strip our own per-page header markers so they don't inflate scores.
  const stripped = t
    .replace(/\[OCR mode:[^\]]*\]/gi, '')
    .replace(/\[ocr failed:[^\]]*\]/gi, '')
    .replace(/\[no text\]/gi, '')
    .replace(/--- Page \d+ ---/g, '')
    .replace(/\[text layer\]|\[ocr\]/gi, '');

  const total = stripped.length || 1;
  let arabic = 0, latin = 0, digit = 0, punct = 0, ws = 0, other = 0;
  for (const ch of stripped) {
    const code = ch.charCodeAt(0);
    if (/\s/.test(ch)) ws++;
    else if (/[0-9]/.test(ch)) digit++;
    else if (code >= 0x0600 && code <= 0x06FF) arabic++;
    else if (/[a-zA-ZÀ-ÿ]/.test(ch)) latin++;
    else if (/[.,;:!?'"()\[\]{}\-—–_/\\@#&%*+=<>°«»…]/.test(ch)) punct++;
    else other++;
  }

  const letters = arabic + latin;
  const charCount = letters + digit;
  const gibberishRatio = other / total;

  const words = stripped.split(/\s+/).filter(Boolean);
  const avgWordLen = words.length
    ? words.reduce((s, w) => s + w.length, 0) / words.length
    : 0;

  if (charCount < 50 || gibberishRatio > 0.4) return 'unreadable';
  if (charCount < 200 || gibberishRatio > 0.2 || avgWordLen > 18) return 'low';
  if (charCount < 800 || gibberishRatio > 0.08) return 'medium';
  return 'high';
}

export const READABILITY_LABEL: Record<OcrReadability, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unreadable: 'Unreadable',
};

/** Tailwind classes for a readability Badge (uses semantic-ish utility colors). */
export function readabilityBadgeClass(r: OcrReadability): string {
  switch (r) {
    case 'high':       return 'border-green-500 text-green-700 dark:text-green-400';
    case 'medium':     return 'border-yellow-500 text-yellow-700 dark:text-yellow-400';
    case 'low':        return 'border-orange-500 text-orange-700 dark:text-orange-400';
    case 'unreadable': return 'border-red-500 text-red-700 dark:text-red-400';
  }
}