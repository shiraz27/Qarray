import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { isPdfUrl, isImageUrl } from '@/utils/mediaTypeUtils';
import { isSplitPdfManifestUrl, fetchSplitPdfManifest } from '@/utils/splitPdfManifest';
import { encodeMediaUrl } from '@/utils/mediaToken';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export type PageCountResult = { count: number; complete: boolean };

async function fetchViaProxy(url: string): Promise<Blob> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const res = await fetch(`${supabaseUrl}/functions/v1/fetch-media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ token: encodeMediaUrl(url) }),
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

/** Race a promise against a timeout. Rejects with `timeout` if exceeded. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Compute total page count for a list of media URLs.
 * - Each PDF URL contributes its actual `numPages`
 * - Each image URL contributes 1
 * - Other types are ignored
 * Returns `{ count, complete }`. `complete=false` means at least one PDF
 * fetch/parse failed; callers can decide to write a partial count or skip.
 */
export async function computePageCountFromUrls(urls: string[]): Promise<PageCountResult> {
  if (!urls?.length) return { count: 0, complete: true };
  let total = 0;
  let complete = true;

  const results = await Promise.all(
    urls.map(async (url): Promise<number | null> => {
      if (!url) return 0;
      if (isSplitPdfManifestUrl(url)) {
        try {
          const manifest = await fetchSplitPdfManifest(url);
          return manifest.totalPages > 0 ? manifest.totalPages : null;
        } catch {
          return null;
        }
      }
      if (isPdfUrl(url)) {
        try {
          const blob = await fetchViaProxy(url);
          const n = await countPdfPages(blob);
          return n > 0 ? n : null;
        } catch {
          return null;
        }
      }
      if (isImageUrl(url)) return 1;
      return 0;
    }),
  );

  for (const r of results) {
    if (r === null) complete = false;
    else total += r;
  }

  return { count: total, complete };
}

/** Order-insensitive equality check for two media URL lists. */
export function mediaUrlsEqual(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  const sa = [...aa].sort();
  const sb = [...bb].sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

/**
 * Compute page count from a list of locally-selected files (pre-upload).
 * PDFs are read directly (no network); images count as 1.
 */
export async function computePageCountFromFiles(files: File[]): Promise<PageCountResult> {
  if (!files?.length) return { count: 0, complete: true };
  let total = 0;
  let complete = true;
  for (const file of files) {
    const mime = (file.type || '').toLowerCase();
    if (mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const n = await countPdfPages(file);
      if (n > 0) total += n;
      else complete = false;
    } else if (mime.startsWith('image/')) {
      total += 1;
    }
  }
  return { count: total, complete };
}

/** Extract URLs from a question's `data` text and compute page count. */
export async function computePageCountFromText(text: string): Promise<PageCountResult> {
  if (!text) return { count: 0, complete: true };
  const urls = text.match(/(https?:\/\/[^\s\n")]+)/g) || [];
  return computePageCountFromUrls(urls);
}