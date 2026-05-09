import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { isPdfUrl, isImageUrl } from '@/utils/mediaTypeUtils';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

async function fetchViaProxy(url: string): Promise<Blob> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const res = await fetch(`${supabaseUrl}/functions/v1/fetch-media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`fetch-media failed: ${res.status}`);
  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    const payload = await res.json().catch(() => null) as { unavailable?: boolean } | null;
    if (payload?.unavailable) throw new Error('unavailable');
  }
  return await res.blob();
}

/** Count pages of a PDF File or Blob. Returns 0 on failure. */
export async function countPdfPages(blob: Blob): Promise<number> {
  try {
    const buf = await blob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    return pdf.numPages || 0;
  } catch (err) {
    console.warn('[page-count] pdf parse failed:', err);
    return 0;
  }
}

/**
 * Compute total page count for a list of media URLs.
 * - Each PDF URL contributes its actual `numPages`
 * - Each image URL contributes 1
 * - Other types are ignored
 * Returns null if computation fails entirely (so callers can leave the column NULL).
 */
export async function computePageCountFromUrls(urls: string[]): Promise<number | null> {
  if (!urls?.length) return 0;
  let total = 0;
  let anyPdfFailed = false;

  for (const url of urls) {
    if (!url) continue;
    if (isPdfUrl(url)) {
      try {
        const blob = await fetchViaProxy(url);
        const n = await countPdfPages(blob);
        if (n > 0) total += n;
        else anyPdfFailed = true;
      } catch {
        anyPdfFailed = true;
      }
    } else if (isImageUrl(url)) {
      total += 1;
    }
  }

  // If a PDF couldn't be parsed, don't lie — return null so admin backfill can retry later.
  if (anyPdfFailed && total === 0) return null;
  return total;
}

/**
 * Compute page count from a list of locally-selected files (pre-upload).
 * PDFs are read directly (no network); images count as 1.
 */
export async function computePageCountFromFiles(files: File[]): Promise<number | null> {
  if (!files?.length) return 0;
  let total = 0;
  let anyPdfFailed = false;
  for (const file of files) {
    const mime = (file.type || '').toLowerCase();
    if (mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const n = await countPdfPages(file);
      if (n > 0) total += n;
      else anyPdfFailed = true;
    } else if (mime.startsWith('image/')) {
      total += 1;
    }
  }
  if (anyPdfFailed && total === 0) return null;
  return total;
}

/** Extract URLs from a question's `data` text and compute page count. */
export async function computePageCountFromText(text: string): Promise<number | null> {
  if (!text) return 0;
  const urls = text.match(/(https?:\/\/[^\s\n")]+)/g) || [];
  return computePageCountFromUrls(urls);
}