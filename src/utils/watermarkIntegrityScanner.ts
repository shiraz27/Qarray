import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { supabase } from '@/integrations/supabase/client';
import { extractMediaFromText } from '@/utils/mediaHelpers';
import { detectMediaType, isSplitPdfManifestUrl } from '@/utils/mediaTypeUtils';
import { fetchSplitPdfManifest } from '@/utils/splitPdfManifest';
import { encodeMediaUrl } from '@/utils/mediaToken';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Phase 1 watermark integrity scan.
 *
 * Reads each PDF on a row via the text layer and counts occurrences of the
 * watermark phrase. Every healthy stamp draws the phrase exactly twice per
 * page (see watermarkPdfBytes in src/utils/watermark.ts), so:
 *
 *   stamps_per_page = floor(occurrences / 2)
 *
 * A row is `over-stamped` when ANY page has more than 1 stamp. Image
 * watermarks aren't text-detectable and are skipped here.
 */

const WATERMARK_PHRASE = 'Qarray.tn -Aqra Blech- Qarray.tn';
const WATERMARK_REGEX = /Qarray\.tn -Aqra Blech- Qarray\.tn/g;

export interface ScanProgress {
  message: string;
  done?: number;
  total?: number;
}

export interface ScanResult {
  success: boolean;
  message: string;
  maxStampCount: number;
  overStamped: boolean;
}

export type ScanTable = 'resources' | 'questions';

async function fetchViaProxy(url: string): Promise<Blob> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const res = await fetch(`${supabaseUrl}/functions/v1/fetch-media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    },
    body: JSON.stringify({ token: encodeMediaUrl(url) }),
  });
  if (!res.ok) throw new Error(`fetch-media ${res.status}`);
  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    const payload = (await res.json().catch(() => null)) as { unavailable?: boolean } | null;
    if (payload?.unavailable) throw new Error('unavailable');
  }
  return await res.blob();
}

/** Count max stamps-per-page in a single PDF blob. */
export async function countStampsInPdfBlob(blob: Blob): Promise<number> {
  const buf = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let max = 0;
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const joined = (tc.items as any[]).map((it) => it.str || '').join('\n');
      const occurrences = (joined.match(WATERMARK_REGEX) || []).length;
      const stamps = Math.floor(occurrences / 2);
      if (stamps > max) max = stamps;
      try { page.cleanup(); } catch { /* ignore */ }
    }
  } finally {
    try { await pdf.destroy(); } catch { /* ignore */ }
  }
  return max;
}

/**
 * Count watermark stamps per page (1-indexed positions in the returned
 * array are at `index + 1`). Used by the watermark processor to skip
 * pages that are already stamped instead of overstamping them.
 */
export async function countStampsPerPageInPdfBlob(blob: Blob): Promise<number[]> {
  const buf = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const counts: number[] = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const joined = (tc.items as any[]).map((it) => it.str || '').join('\n');
      const occurrences = (joined.match(WATERMARK_REGEX) || []).length;
      counts.push(Math.floor(occurrences / 2));
      try { page.cleanup(); } catch { /* ignore */ }
    }
  } finally {
    try { await pdf.destroy(); } catch { /* ignore */ }
  }
  return counts;
}

/** Expand a row's media list into the actual PDF URLs to scan. */
async function collectPdfUrls(media: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of media) {
    if (isSplitPdfManifestUrl(url)) {
      try {
        const manifest = await fetchSplitPdfManifest(url);
        for (const p of manifest.pages) out.push(p.url);
      } catch {
        /* skip unresolvable manifests */
      }
      continue;
    }
    if (detectMediaType(url) === 'pdf') out.push(url);
  }
  return out;
}

export async function scanRowWatermarkIntegrity(
  table: ScanTable,
  rowId: number,
  onProgress?: (p: ScanProgress) => void,
): Promise<ScanResult> {
  try {
    onProgress?.({ message: `Loading ${table.slice(0, -1)} #${rowId}…` });
    const { data: row, error } = await (supabase as any)
      .from(table)
      .select('data')
      .eq('id', rowId)
      .single();
    if (error || !row) throw new Error(`${table} not found`);

    const rawText = Array.isArray(row.data) ? (row.data as string[]).join('\n') : (row.data || '');
    const media = extractMediaFromText(rawText).media.map((m) => m.url);
    const pdfUrls = await collectPdfUrls(media);

    if (pdfUrls.length === 0) {
      await (supabase as any)
        .from(table)
        .update({
          watermark_stamp_count: 0,
          watermark_overstamped: false,
          watermark_scan_at: new Date().toISOString(),
        })
        .eq('id', rowId);
      return {
        success: true,
        message: 'No PDFs to scan',
        maxStampCount: 0,
        overStamped: false,
      };
    }

    let maxStamps = 0;
    let done = 0;
    for (const url of pdfUrls) {
      try {
        const blob = await fetchViaProxy(url);
        const stamps = await countStampsInPdfBlob(blob);
        if (stamps > maxStamps) maxStamps = stamps;
      } catch (e) {
        console.warn('[wm-integrity] failed', url, e);
      }
      done += 1;
      onProgress?.({ message: `Scanned ${done}/${pdfUrls.length}…`, done, total: pdfUrls.length });
    }

    const overStamped = maxStamps > 1;
    await (supabase as any)
      .from(table)
      .update({
        watermark_stamp_count: maxStamps,
        watermark_overstamped: overStamped,
        watermark_scan_at: new Date().toISOString(),
      })
      .eq('id', rowId);

    return {
      success: true,
      message: overStamped
        ? `Over-stamped: max ${maxStamps} stamps on a single page`
        : `OK: ${maxStamps} stamp(s) per page`,
      maxStampCount: maxStamps,
      overStamped,
    };
  } catch (err: any) {
    console.error('[wm-integrity] fatal', err);
    return {
      success: false,
      message: err?.message || String(err),
      maxStampCount: 0,
      overStamped: false,
    };
  }
}

export const scanResourceIntegrity = (id: number, onProgress?: (p: ScanProgress) => void) =>
  scanRowWatermarkIntegrity('resources', id, onProgress);

export const scanQuestionIntegrity = (id: number, onProgress?: (p: ScanProgress) => void) =>
  scanRowWatermarkIntegrity('questions', id, onProgress);

export { WATERMARK_PHRASE };