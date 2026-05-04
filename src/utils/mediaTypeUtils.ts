/**
 * Shared media URL classification utilities.
 *
 * Used by:
 *  - OCR processors (resources / questions)
 *  - Statistics page (canProcess, batch retry)
 *  - Add/Edit forms (initial ocr_status)
 */

export type MediaType = 'pdf' | 'image' | 'video' | 'audio' | 'unknown';

/** True if the URL looks like a PDF (regular extension or Archive.org `-pdf` style). */
export function isPdfUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('.pdf') ||
    lower.includes('%2epdf') ||
    lower.endsWith('-pdf') ||
    lower.includes('-pdf/') ||
    lower.includes('-pdf?') ||
    lower.includes('-pdf#')
  );
}

/** True if the URL looks like an image (regular extension or Archive.org `-png` style). */
export function isImageUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    !!lower.match(/\.(jpg|jpeg|png|gif|webp)/i) ||
    !!lower.match(/-(jpg|jpeg|png|gif|webp)($|[/?#])/i)
  );
}

/** True if the URL looks like a video. */
export function isVideoUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    !!lower.match(/\.(mp4|webm|mov)/i) ||
    !!lower.match(/-(mp4|webm|mov)($|[/?#])/i) ||
    lower.includes('youtube') ||
    lower.includes('youtu.be')
  );
}

/** True if the URL looks like audio. */
export function isAudioUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    !!lower.match(/\.(mp3|wav|ogg|m4a)/i) ||
    !!lower.match(/-(mp3|wav|ogg|m4a)($|[/?#])/i)
  );
}

/** Classify a URL by extension. Returns 'unknown' if no signal is found. */
export function detectMediaType(url: string): MediaType {
  if (isPdfUrl(url)) return 'pdf';
  if (isImageUrl(url)) return 'image';
  if (isVideoUrl(url)) return 'video';
  if (isAudioUrl(url)) return 'audio';
  return 'unknown';
}

/** Check whether a string contains at least one OCR-able URL (PDF or image). */
export function textHasOcrableUrl(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('.pdf') ||
    lower.includes('-pdf') ||
    !!lower.match(/\.(jpg|jpeg|png|gif|webp)/i) ||
    !!lower.match(/-(jpg|jpeg|png|gif|webp)($|[/?#])/i)
  );
}

/** Check whether an array of URLs contains at least one OCR-able URL. */
export function urlsHaveOcrable(urls: string[] | null | undefined): boolean {
  if (!urls || urls.length === 0) return false;
  return urls.some((u) => isPdfUrl(u) || isImageUrl(u));
}

/**
 * Map a Blob's MIME type back to one of our media types.
 * Used as a fallback when a URL has an unknown extension but the proxy
 * returns a recognisable Content-Type.
 */
export function mediaTypeFromMime(mime: string | null | undefined): MediaType {
  if (!mime) return 'unknown';
  const m = mime.toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'unknown';
}