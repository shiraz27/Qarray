import { isSplitPdfManifestUrl } from '@/utils/mediaTypeUtils';
import { encodeMediaUrl } from '@/utils/mediaToken';

export interface SplitPdfManifestPage {
  n: number;
  url: string;
}

export interface SplitPdfManifest {
  version: number;
  kind: 'split-pdf';
  originalName: string;
  totalPages: number;
  createdAt?: string;
  pages: SplitPdfManifestPage[];
}

export { isSplitPdfManifestUrl };

/**
 * Fetch a split-PDF manifest through the fetch-media proxy.
 * Throws on failure; returns the parsed manifest on success.
 */
export async function fetchSplitPdfManifest(url: string): Promise<SplitPdfManifest> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/fetch-media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ token: encodeMediaUrl(url) }),
  });

  if (!res.ok) {
    throw new Error(`Manifest fetch failed: ${res.status}`);
  }

  // The proxy may return the JSON manifest with content-type application/json
  // and our `unavailable` envelope for upstream propagation misses.
  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Manifest is not valid JSON');
  }
  if (parsed?.unavailable) {
    throw new Error(parsed.error || 'Manifest not available yet');
  }
  if (parsed?.kind !== 'split-pdf' || !Array.isArray(parsed.pages)) {
    throw new Error('Not a split-PDF manifest');
  }
  return parsed as SplitPdfManifest;
}

/**
 * Given a list of media URLs, replace any split-PDF manifest URLs with their
 * underlying per-page PDF URLs. Used by OCR processors to transparently
 * iterate over all pages.
 */
export async function expandManifestUrls(urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    if (isSplitPdfManifestUrl(url)) {
      try {
        const manifest = await fetchSplitPdfManifest(url);
        for (const page of manifest.pages) out.push(page.url);
      } catch (e) {
        // If we can't expand, keep the original URL so the caller surfaces a
        // proper "fetch failed" error instead of silently dropping the file.
        console.warn('[split-pdf] manifest expand failed:', e);
        out.push(url);
      }
    } else {
      out.push(url);
    }
  }
  return out;
}