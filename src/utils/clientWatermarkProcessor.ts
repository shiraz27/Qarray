import { supabase } from '@/integrations/supabase/client';
import { extractMediaFromText } from '@/utils/mediaHelpers';
import { detectMediaType, mediaTypeFromMime, isSplitPdfManifestUrl } from '@/utils/mediaTypeUtils';
import { fetchSplitPdfManifest } from '@/utils/splitPdfManifest';
import { decodeMediaToken, encodeMediaUrl, isMediaToken } from '@/utils/mediaToken';
import { watermarkPdfBlob, watermarkImageBlob } from '@/utils/watermark';

/**
 * Persistent watermark backfill.
 *
 * - Fetches each original PDF/image via the fetch-media proxy.
 * - Stamps it with the diagonal Qarray.tn watermark (re-using src/utils/watermark.ts).
 * - Overwrites the same Archive.org key via upload-to-archive (`overwrite` action),
 *   so public URLs and DB rows never change.
 * - Updates watermark_status / pages_watermarked / watermark_processed_at /
 *   watermark_error on the row, with `partial` semantics for split PDFs.
 */

const ARCHIVE_PREFIX = 'https://archive.org/download/';
const ITEM = 'qarray-educational-content';
const ARCHIVE_ITEM_PREFIX = `${ARCHIVE_PREFIX}${ITEM}/`;

// Files larger than this can't be safely round-tripped through the edge
// function's overwrite action — flag them as failed with a clear message
// rather than crashing the worker.
const MAX_OVERWRITE_BYTES = 45 * 1024 * 1024;

function archiveKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const raw = isMediaToken(url) ? decodeMediaToken(url) : url;
  if (!raw || !raw.startsWith(ARCHIVE_ITEM_PREFIX)) return null;
  return raw.slice(ARCHIVE_ITEM_PREFIX.length);
}

async function fetchOriginalViaProxy(url: string): Promise<Blob> {
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
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`fetch-media ${res.status}: ${text.slice(0, 200)}`);
  }
  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    const payload = await res.json().catch(() => null) as { unavailable?: boolean; error?: string } | null;
    if (payload?.unavailable) throw new Error(payload.error || 'File not available yet');
  }
  return await res.blob();
}

async function overwriteArchiveKey(key: string, blob: Blob, mediatype: 'texts' | 'image'): Promise<void> {
  if (blob.size > MAX_OVERWRITE_BYTES) {
    throw new Error(`File too large to overwrite (${(blob.size / 1024 / 1024).toFixed(1)} MB > 45 MB)`);
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const form = new FormData();
  form.append('action', 'overwrite');
  form.append('key', key);
  form.append('mediatype', mediatype);
  // Filename in the form is informational only — server uses `key`.
  const filename = key.split('/').pop() || 'file.bin';
  form.append('file', new File([blob], filename, { type: blob.type || 'application/octet-stream' }));

  const res = await fetch(`${supabaseUrl}/functions/v1/upload-to-archive?action=overwrite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey },
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`overwrite ${res.status}: ${txt.slice(0, 200)}`);
  }
}

type UnitKind = 'pdf' | 'image' | 'manifest' | 'unsupported';

interface ProcessUnit {
  url: string;
  kind: UnitKind;
  /** When manifest, the underlying per-page PDF URLs. */
  pageUrls?: string[];
}

function classifyUnit(url: string): ProcessUnit {
  if (isSplitPdfManifestUrl(url)) return { url, kind: 'manifest' };
  const t = detectMediaType(url);
  if (t === 'pdf') return { url, kind: 'pdf' };
  if (t === 'image') return { url, kind: 'image' };
  return { url, kind: 'unsupported' };
}

async function watermarkAndOverwriteOne(url: string, fallbackKind?: 'pdf' | 'image'): Promise<void> {
  const key = archiveKeyFromUrl(url);
  if (!key) throw new Error('URL is not an Archive.org item — cannot overwrite');

  const blob = await fetchOriginalViaProxy(url);

  let kind = fallbackKind || (detectMediaType(url) as 'pdf' | 'image' | 'unknown');
  if (kind === 'unknown') {
    const mime = mediaTypeFromMime(blob.type);
    if (mime === 'pdf' || mime === 'image') kind = mime;
  }
  if (kind !== 'pdf' && kind !== 'image') {
    throw new Error(`Unsupported type for watermark: ${blob.type || 'unknown'}`);
  }

  const stamped =
    kind === 'pdf' ? await watermarkPdfBlob(blob) : await watermarkImageBlob(blob);
  await overwriteArchiveKey(key, stamped, kind === 'pdf' ? 'texts' : 'image');
}

export interface WatermarkProgress {
  message: string;
  done?: number;
  total?: number;
}

export type WatermarkTable = 'resources' | 'questions';

export interface WatermarkResult {
  success: boolean;
  message: string;
  status: 'completed' | 'partial' | 'failed' | 'not_applicable';
  pagesWatermarked: number;
}

/**
 * Process every media URL on a row, watermark each, and update status.
 * Works for both resources (`data text[]`) and questions (`data text`).
 */
export async function processRowWatermark(
  table: WatermarkTable,
  rowId: number,
  onProgress?: (p: WatermarkProgress) => void,
): Promise<WatermarkResult> {
  const writeFinal = async (patch: Record<string, any>) => {
    await (supabase as any).from(table).update({
      ...patch,
      watermark_processed_at: new Date().toISOString(),
    }).eq('id', rowId);
  };

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

    if (media.length === 0) {
      await writeFinal({
        watermark_status: 'not_applicable',
        pages_watermarked: 0,
        watermark_error: null,
      });
      return { success: true, message: 'No media to watermark', status: 'not_applicable', pagesWatermarked: 0 };
    }

    // Mark in_progress so admins see live state.
    await (supabase as any).from(table).update({ watermark_status: 'in_progress' }).eq('id', rowId);

    // Classify and expand split-PDF manifests.
    const units: ProcessUnit[] = [];
    for (const url of media) {
      const u = classifyUnit(url);
      if (u.kind === 'manifest') {
        try {
          const manifest = await fetchSplitPdfManifest(url);
          u.pageUrls = manifest.pages.map((p) => p.url);
        } catch (e: any) {
          u.pageUrls = []; // surfaces as failure below
        }
      }
      units.push(u);
    }

    // Count total stampable items for progress reporting.
    let total = 0;
    for (const u of units) {
      if (u.kind === 'pdf' || u.kind === 'image') total += 1;
      else if (u.kind === 'manifest') total += (u.pageUrls?.length || 0);
    }

    if (total === 0) {
      // Only videos/audio etc.
      await writeFinal({
        watermark_status: 'not_applicable',
        pages_watermarked: 0,
        watermark_error: null,
      });
      return { success: true, message: 'No PDFs/images to watermark', status: 'not_applicable', pagesWatermarked: 0 };
    }

    let done = 0;
    let failed = 0;
    let lastError: string | null = null;

    const tick = async (delta: number) => {
      done += delta;
      onProgress?.({ message: `Stamped ${done}/${total}…`, done, total });
      // Live-update the running count so admins can watch progress in the table.
      try {
        await (supabase as any).from(table).update({ pages_watermarked: done }).eq('id', rowId);
      } catch {
        /* non-fatal */
      }
    };

    for (const u of units) {
      if (u.kind === 'unsupported') continue;

      if (u.kind === 'pdf' || u.kind === 'image') {
        try {
          await watermarkAndOverwriteOne(u.url, u.kind);
          await tick(1);
        } catch (e: any) {
          failed += 1;
          lastError = e?.message || String(e);
          console.warn('[watermark] failed', u.url, e);
        }
        continue;
      }

      // Manifest: stamp each page.
      const pages = u.pageUrls || [];
      if (pages.length === 0) {
        failed += 1;
        lastError = 'split-PDF manifest could not be expanded';
        continue;
      }
      for (const pageUrl of pages) {
        try {
          await watermarkAndOverwriteOne(pageUrl, 'pdf');
          await tick(1);
        } catch (e: any) {
          failed += 1;
          lastError = e?.message || String(e);
          console.warn('[watermark] page failed', pageUrl, e);
        }
      }
    }

    const successCount = done;
    let status: 'completed' | 'partial' | 'failed';
    if (successCount === 0) status = 'failed';
    else if (failed > 0) status = 'partial';
    else status = 'completed';

    await writeFinal({
      watermark_status: status,
      pages_watermarked: successCount,
      watermark_error: status === 'completed' ? null : lastError,
    });

    return {
      success: status !== 'failed',
      message:
        status === 'completed'
          ? `Watermarked ${successCount}/${total}`
          : status === 'partial'
            ? `Partial: ${successCount}/${total} (${failed} failed) — ${lastError ?? ''}`
            : `Failed: 0/${total} — ${lastError ?? ''}`,
      status,
      pagesWatermarked: successCount,
    };
  } catch (err: any) {
    console.error('[watermark] fatal', err);
    try {
      await writeFinal({
        watermark_status: 'failed',
        watermark_error: err?.message || String(err),
      });
    } catch {
      /* swallow */
    }
    return {
      success: false,
      message: err?.message || String(err),
      status: 'failed',
      pagesWatermarked: 0,
    };
  }
}

export const processResourceWatermark = (id: number, onProgress?: (p: WatermarkProgress) => void) =>
  processRowWatermark('resources', id, onProgress);

export const processQuestionWatermark = (id: number, onProgress?: (p: WatermarkProgress) => void) =>
  processRowWatermark('questions', id, onProgress);