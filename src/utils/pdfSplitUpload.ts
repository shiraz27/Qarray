import { PDFDocument } from 'pdf-lib';
import {
  uploadFileToArchiveControlled,
  type ArchiveUploadController,
  type ArchiveUploadHandle,
  type ArchiveUploadOptions,
  type ArchiveUploadProgress,
} from '@/utils/archiveMultipartUpload';
import type { SplitPdfManifest } from '@/utils/splitPdfManifest';

/** Split threshold: PDFs with strictly more pages than this get split. */
export const SPLIT_PAGE_THRESHOLD = 3;

function sanitizeBase(s: string): string {
  return s
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'doc';
}

function shortHash(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

async function readPageCount(file: File): Promise<number> {
  const buf = await file.arrayBuffer();
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  return doc.getPageCount();
}

async function splitPdfToPages(file: File): Promise<File[]> {
  const buf = await file.arrayBuffer();
  const src = await PDFDocument.load(buf, { ignoreEncryption: true });
  const total = src.getPageCount();
  const out: File[] = [];
  for (let i = 0; i < total; i++) {
    const dst = await PDFDocument.create();
    const [copied] = await dst.copyPages(src, [i]);
    dst.addPage(copied);
    const bytes = await dst.save();
    // pdf-lib returns Uint8Array<ArrayBufferLike>; copy into a plain ArrayBuffer
    // so it satisfies BlobPart in strict TS.
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    out.push(
      new File([ab], `${i + 1}.pdf`, { type: 'application/pdf' }),
    );
  }
  return out;
}

export interface PdfSplitUploadHandle {
  promise: Promise<{ url: string }>;
  controller: ArchiveUploadController;
}

/**
 * Upload a PDF, splitting into one-file-per-page when it has more than
 * SPLIT_PAGE_THRESHOLD pages. Always returns a single URL — either the direct
 * PDF URL (small files) or the manifest URL (split files). Backwards
 * compatible with the rest of the upload pipeline (same handle shape as
 * `uploadFileToArchiveControlled`).
 */
export function uploadPdfMaybeSplit(
  file: File,
  options: ArchiveUploadOptions,
  onProgress?: (p: ArchiveUploadProgress) => void,
): PdfSplitUploadHandle {
  let cancelled = false;
  let activeController: ArchiveUploadController | null = null;

  const controller: ArchiveUploadController = {
    pause: () => activeController?.pause(),
    resume: () => activeController?.resume(),
    cancel: () => {
      cancelled = true;
      activeController?.cancel();
    },
    isPaused: () => !!activeController?.isPaused(),
  };

  const promise = (async (): Promise<{ url: string }> => {
    // 1. Decide whether to split. Failure to parse falls back to single upload.
    let pageCount = 0;
    try {
      pageCount = await readPageCount(file);
    } catch (e) {
      console.warn('[split-pdf] page count failed, uploading as single file:', e);
    }

    if (pageCount <= SPLIT_PAGE_THRESHOLD) {
      const handle = uploadFileToArchiveControlled(file, options, onProgress);
      activeController = handle.controller;
      if (cancelled) handle.controller.cancel();
      return handle.promise;
    }

    // 2. Split.
    onProgress?.({ loaded: 0, total: file.size, ratio: 0 });
    const pageFiles = await splitPdfToPages(file);
    if (cancelled) throw new DOMException('Upload cancelled', 'AbortError');

    // 3. Upload each page sequentially. Aggregate progress across pages
    // (each page contributes 1/N of the total ratio).
    const base = `${sanitizeBase(file.name)}-${shortHash()}`;
    const pageUrls: string[] = [];
    const N = pageFiles.length;
    let pagesDone = 0;

    for (let i = 0; i < N; i++) {
      if (cancelled) throw new DOMException('Upload cancelled', 'AbortError');
      const pageFile = pageFiles[i];
      const pageNumber = i + 1;
      const handle: ArchiveUploadHandle = uploadFileToArchiveControlled(
        pageFile,
        {
          ...options,
          fileName: `${pageNumber}.pdf`,
          subPath: `${base}/pages/${pageNumber}.pdf`,
        },
        (p) => {
          // Per-page progress folded into a 0..1 overall ratio that excludes
          // the manifest write (we add a final tick at the end).
          const overall =
            (pagesDone + p.ratio) / (N + 1); // +1 for manifest step
          onProgress?.({
            loaded: Math.round(overall * file.size),
            total: file.size,
            ratio: overall,
          });
        },
      );
      activeController = handle.controller;
      const { url } = await handle.promise;
      pageUrls.push(url);
      pagesDone++;
    }

    // 4. Build & upload manifest.
    if (cancelled) throw new DOMException('Upload cancelled', 'AbortError');
    const manifest: SplitPdfManifest = {
      version: 1,
      kind: 'split-pdf',
      originalName: file.name,
      totalPages: N,
      createdAt: new Date().toISOString(),
      pages: pageUrls.map((url, i) => ({ n: i + 1, url })),
    };
    const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json',
    });
    const manifestFile = new File([manifestBlob], 'manifest.json', {
      type: 'application/json',
    });
    const manifestHandle = uploadFileToArchiveControlled(
      manifestFile,
      {
        ...options,
        fileName: 'manifest.json',
        // Keep the leaf as `manifest.json` so the URL detection regex matches.
        subPath: `${base}/pages/manifest.json`,
        // fileType 'pdf' keeps the same archive item mediatype as the pages,
        // so everything stays in the same Archive.org item.
        fileType: 'pdf',
      },
      undefined,
    );
    activeController = manifestHandle.controller;
    const { url: manifestUrl } = await manifestHandle.promise;

    onProgress?.({ loaded: file.size, total: file.size, ratio: 1 });
    return { url: manifestUrl };
  })();

  return { promise, controller };
}