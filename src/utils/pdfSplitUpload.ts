import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  uploadFileToArchiveControlled,
  type ArchiveUploadController,
  type ArchiveUploadHandle,
  type ArchiveUploadOptions,
  type ArchiveUploadProgress,
} from '@/utils/archiveMultipartUpload';
import type { SplitPdfManifest } from '@/utils/splitPdfManifest';

// Idempotent worker config (matches pdfOcrHelpers.ts).
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Split threshold: PDFs with strictly more pages than this used to get split.
 * Kept for easy revert — currently UNUSED because every PDF is force-split.
 */
export const SPLIT_PAGE_THRESHOLD = 3;

export function sanitizeBase(s: string): string {
  return s
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'doc';
}

export function shortHash(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

async function readPageCount(file: File): Promise<number> {
  const buf = await file.arrayBuffer();
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * Rasterize a single page via pdfjs-dist and wrap it into a 1-page PDF.
 * Used as a fallback when pdf-lib's `copyPages` throws on malformed sources
 * (e.g. "Expected instance of PDFDict, but got instance of undefined").
 * The page loses selectable text but remains viewable and OCR-able.
 */
async function rasterizePageToPdf(
  srcBytes: Uint8Array,
  pageIndex: number, // 0-based
): Promise<File> {
  // pdfjs mutates the buffer it receives; pass a copy.
  const copy = new Uint8Array(srcBytes);
  const loadingTask = pdfjsLib.getDocument({ data: copy });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 150 / 72 }); // ~150 DPI
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const pngBlob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
        'image/png',
      ),
    );
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

    const dst = await PDFDocument.create();
    const img = await dst.embedPng(pngBytes);
    // Preserve original page dimensions (in PDF points) so OCR/coordinates line up.
    const pageWidth = viewport.width / (150 / 72);
    const pageHeight = viewport.height / (150 / 72);
    const p = dst.addPage([pageWidth, pageHeight]);
    p.drawImage(img, { x: 0, y: 0, width: pageWidth, height: pageHeight });
    const bytes = await dst.save();
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    return new File([ab], `${pageIndex + 1}.pdf`, { type: 'application/pdf' });
  } finally {
    try { await pdf.destroy(); } catch { /* ignore */ }
  }
}

export interface SplitResult {
  files: File[];
  rasterizedIndices: number[]; // 0-based
  failedIndices: number[];     // 0-based
}

/**
 * Split a PDF into one File per page. Hardened against malformed sources:
 *
 * 1. Primary path: pdf-lib `copyPages` (fast, preserves text).
 * 2. Per-page fallback: rasterize via pdfjs-dist → 1-page PDF wrapping a PNG.
 *
 * Pages that fail both paths are skipped and reported in `failedIndices`.
 * This is partially backwards-compatible: callers using `await splitPdfToPages(file)`
 * directly will get `File[]` via the legacy export.
 */
export async function splitPdfToPagesDetailed(file: File): Promise<SplitResult> {
  const buf = await file.arrayBuffer();
  const srcBytes = new Uint8Array(buf);

  let src: PDFDocument;
  try {
    src = await PDFDocument.load(buf, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
  } catch (e) {
    console.error('[split-pdf] pdf-lib load failed, falling back to raster-only', e);
    // Use pdfjs to determine page count and rasterize every page.
    const copy = new Uint8Array(srcBytes);
    const pdf = await pdfjsLib.getDocument({ data: copy }).promise;
    const total = pdf.numPages;
    try { await pdf.destroy(); } catch { /* ignore */ }
    const files: File[] = [];
    const rasterized: number[] = [];
    const failed: number[] = [];
    for (let i = 0; i < total; i++) {
      try {
        files.push(await rasterizePageToPdf(srcBytes, i));
        rasterized.push(i);
      } catch (err) {
        console.error(`[split-pdf] raster page ${i + 1} failed`, err);
        failed.push(i);
      }
    }
    return { files, rasterizedIndices: rasterized, failedIndices: failed };
  }

  const total = src.getPageCount();

  // Layer 1: try to copy all pages in a single call (more reliable than
  // re-parsing the page tree N times, and avoids one bad page killing the rest).
  let bulkCopied: any[] | null = null;
  try {
    const tmp = await PDFDocument.create();
    bulkCopied = await tmp.copyPages(src, Array.from({ length: total }, (_, i) => i));
  } catch (e) {
    console.warn('[split-pdf] bulk copyPages failed, will copy per page', e);
    bulkCopied = null;
  }

  const out: File[] = [];
  const rasterized: number[] = [];
  const failed: number[] = [];

  for (let i = 0; i < total; i++) {
    let pageFile: File | null = null;

    // Try bulk-copied page first.
    if (bulkCopied && bulkCopied[i]) {
      try {
        const dst = await PDFDocument.create();
        dst.addPage(bulkCopied[i]);
        const bytes = await dst.save();
        const ab = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        pageFile = new File([ab], `${i + 1}.pdf`, { type: 'application/pdf' });
      } catch (e) {
        console.warn(`[split-pdf] bulk-copied page ${i + 1} failed to save`, e);
      }
    }

    // Try per-page copyPages from the original source.
    if (!pageFile) {
      try {
        const dst = await PDFDocument.create();
        const [copied] = await dst.copyPages(src, [i]);
        dst.addPage(copied);
        const bytes = await dst.save();
        const ab = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        pageFile = new File([ab], `${i + 1}.pdf`, { type: 'application/pdf' });
      } catch (e) {
        console.warn(`[split-pdf] per-page copyPages failed for page ${i + 1}, rasterizing`, e);
      }
    }

    // Final fallback: rasterize.
    if (!pageFile) {
      try {
        pageFile = await rasterizePageToPdf(srcBytes, i);
        rasterized.push(i);
      } catch (e) {
        console.error(`[split-pdf] rasterization fallback failed for page ${i + 1}`, e);
        failed.push(i);
      }
    }

    if (pageFile) out.push(pageFile);
  }

  return { files: out, rasterizedIndices: rasterized, failedIndices: failed };
}

/** Backwards-compatible wrapper returning only the files. */
export async function splitPdfToPages(file: File): Promise<File[]> {
  const { files, rasterizedIndices, failedIndices } = await splitPdfToPagesDetailed(file);
  if (rasterizedIndices.length || failedIndices.length) {
    console.warn('[split-pdf] partial split', { rasterizedIndices, failedIndices });
  }
  return files;
}

/**
 * Build a split-PDF manifest JSON and upload it to the same Archive.org item
 * folder as the pages. Returns the manifest URL.
 */
export async function buildAndUploadManifest(params: {
  base: string;
  pageUrls: string[];
  originalName: string;
  options: ArchiveUploadOptions;
}): Promise<{ url: string }> {
  const { base, pageUrls, originalName, options } = params;
  const manifest: SplitPdfManifest = {
    version: 1,
    kind: 'split-pdf',
    originalName,
    totalPages: pageUrls.length,
    createdAt: new Date().toISOString(),
    pages: pageUrls.map((url, i) => ({ n: i + 1, url })),
  };
  const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: 'application/json',
  });
  const manifestFile = new File([manifestBlob], 'manifest.json', {
    type: 'application/json',
  });
  const handle = uploadFileToArchiveControlled(
    manifestFile,
    {
      ...options,
      fileName: 'manifest.json',
      subPath: `${base}/pages/manifest.json`,
      // fileType 'pdf' keeps the same archive item mediatype as the pages.
      fileType: 'pdf',
    },
    undefined,
  );
  return handle.promise;
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
    let parseFailed = false;
    try {
      pageCount = await readPageCount(file);
    } catch (e) {
      console.warn('[split-pdf] page count failed, uploading as single file:', e);
      parseFailed = true;
    }

    // Force-split every PDF. Single-file fallback only when pdf-lib couldn't
    // parse the file at all (corrupt/encrypted).
    if (parseFailed || pageCount < 1) {
      const handle = uploadFileToArchiveControlled(file, options, onProgress);
      activeController = handle.controller;
      if (cancelled) handle.controller.cancel();
      return handle.promise;
    }
    // --- Legacy threshold path, kept commented for easy revert ---
    // if (pageCount <= SPLIT_PAGE_THRESHOLD) {
    //   const handle = uploadFileToArchiveControlled(file, options, onProgress);
    //   activeController = handle.controller;
    //   if (cancelled) handle.controller.cancel();
    //   return handle.promise;
    // }

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
    const { url: manifestUrl } = await buildAndUploadManifest({
      base,
      pageUrls,
      originalName: file.name,
      options,
    });

    onProgress?.({ loaded: file.size, total: file.size, ratio: 1 });
    return { url: manifestUrl };
  })();

  return { promise, controller };
}