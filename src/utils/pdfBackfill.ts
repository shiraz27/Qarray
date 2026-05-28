import { supabase } from '@/integrations/supabase/client';
import { fetchPdfViaProxy } from '@/utils/pdfMediaFetch';
import {
  splitPdfToPagesDetailed,
  sanitizeBase,
  shortHash,
  buildAndUploadManifest,
} from '@/utils/pdfSplitUpload';
import { uploadFileToArchiveControlled } from '@/utils/archiveMultipartUpload';
import { encodeMediaUrl, tokenInnerPath } from '@/utils/mediaToken';
import { isPdfUrl, isSplitPdfManifestUrl } from '@/utils/mediaTypeUtils';

export interface BackfillProgress {
  phase: 'fetch' | 'split' | 'upload-page' | 'manifest' | 'save' | 'done';
  currentPage?: number;
  totalPages?: number;
  urlIndex?: number;
  urlTotal?: number;
  /** Pages that fell back to rasterization during the most recent split. */
  rasterizedPages?: number;
  /** Pages dropped because both split paths failed. */
  failedPages?: number;
}

/** Pick the URLs in a row that are PDFs but NOT already manifest URLs. */
export function findUnsplitPdfUrls(urls: string[]): string[] {
  return urls.filter((u) => isPdfUrl(u) && !isSplitPdfManifestUrl(u));
}

/** Derive a readable original filename from a token / URL. */
function leafFromUrl(url: string): string {
  const path = tokenInnerPath(url);
  const leaf = path.split('/').pop() || 'document.pdf';
  // Archive.org "-pdf" dashified extension → restore for naming
  return leaf.replace(/-pdf$/i, '.pdf');
}

async function migrateSingleUrl(
  url: string,
  chapterId: number | null,
  onProgress?: (p: BackfillProgress) => void,
): Promise<string> {
  onProgress?.({ phase: 'fetch' });
  const fetched = await fetchPdfViaProxy(url);
  if (fetched.kind !== 'ok') {
    throw new Error(
      fetched.kind === 'unavailable'
        ? `Source unavailable: ${fetched.message || 'try again later'}`
        : `Fetch failed: ${fetched.message}`,
    );
  }
  const originalName = leafFromUrl(url);
  const file = new File([fetched.blob], originalName, { type: 'application/pdf' });

  onProgress?.({ phase: 'split' });
  const { files: pages, rasterizedIndices, failedIndices } =
    await splitPdfToPagesDetailed(file);
  if (rasterizedIndices.length || failedIndices.length) {
    onProgress?.({
      phase: 'split',
      rasterizedPages: rasterizedIndices.length,
      failedPages: failedIndices.length,
      totalPages: pages.length + failedIndices.length,
    });
  }
  if (pages.length === 0) {
    throw new Error('Split failed: no pages could be extracted');
  }
  const base = `${sanitizeBase(originalName)}-${shortHash()}`;

  const archiveOpts = {
    fileName: originalName,
    fileType: 'pdf' as const,
    chapterId: chapterId ?? undefined,
  };

  const pageUrls: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const n = i + 1;
    onProgress?.({ phase: 'upload-page', currentPage: n, totalPages: pages.length });
    const handle = uploadFileToArchiveControlled(
      pages[i],
      {
        ...archiveOpts,
        fileName: `${n}.pdf`,
        subPath: `${base}/pages/${n}.pdf`,
      },
    );
    const { url: pageUrl } = await handle.promise;
    pageUrls.push(pageUrl);
  }

  onProgress?.({ phase: 'manifest', totalPages: pages.length });
  const { url: manifestUrl } = await buildAndUploadManifest({
    base,
    pageUrls,
    originalName,
    options: archiveOpts,
  });

  return encodeMediaUrl(manifestUrl);
}

/**
 * Migrate every non-manifest PDF in a resource's `data` array to split-PDF
 * manifests. Persists after each successful URL so partial progress sticks.
 * Returns the final `data` array.
 */
export async function migrateResourcePdfs(
  resource: { id: number; data: string[]; chapter_id: number | null },
  onProgress?: (p: BackfillProgress) => void,
): Promise<string[]> {
  let data = [...resource.data];
  const targets = data
    .map((u, i) => ({ u, i }))
    .filter(({ u }) => isPdfUrl(u) && !isSplitPdfManifestUrl(u));

  for (let k = 0; k < targets.length; k++) {
    const { u, i } = targets[k];
    const newToken = await migrateSingleUrl(u, resource.chapter_id, (p) =>
      onProgress?.({ ...p, urlIndex: k + 1, urlTotal: targets.length }),
    );
    data[i] = newToken;
    onProgress?.({ phase: 'save', urlIndex: k + 1, urlTotal: targets.length });
    const { error } = await supabase
      .from('resources')
      .update({ data })
      .eq('id', resource.id);
    if (error) throw new Error(`DB update failed: ${error.message}`);
  }
  onProgress?.({ phase: 'done' });
  return data;
}

/**
 * Migrate every non-manifest PDF URL embedded in a question's `data` text.
 * Each old URL/token is replaced inline; the row is saved after every URL.
 */
export async function migrateQuestionPdfs(
  question: { id: number; data: string; chapter_id: number | null },
  urls: string[],
  onProgress?: (p: BackfillProgress) => void,
): Promise<string> {
  let text = question.data;
  const targets = urls.filter((u) => isPdfUrl(u) && !isSplitPdfManifestUrl(u));

  for (let k = 0; k < targets.length; k++) {
    const u = targets[k];
    const newToken = await migrateSingleUrl(u, question.chapter_id, (p) =>
      onProgress?.({ ...p, urlIndex: k + 1, urlTotal: targets.length }),
    );
    text = text.split(u).join(newToken);
    onProgress?.({ phase: 'save', urlIndex: k + 1, urlTotal: targets.length });
    const { error } = await supabase
      .from('questions')
      .update({ data: text })
      .eq('id', question.id);
    if (error) throw new Error(`DB update failed: ${error.message}`);
  }
  onProgress?.({ phase: 'done' });
  return text;
}