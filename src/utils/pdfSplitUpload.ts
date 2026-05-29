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
import { fetchPdfViaProxy } from '@/utils/pdfMediaFetch';

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
  const bytes = new Uint8Array(buf);

  // Prefer pdfjs for counting. pdf-lib can successfully load malformed PDFs
  // and then throw "Expected instance of PDFDict2..." when walking pages.
  try {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
    const count = pdf.numPages;
    try { await pdf.destroy(); } catch { /* ignore */ }
    return count;
  } catch (pdfjsError) {
    console.warn('[split-pdf] pdfjs page count failed, trying pdf-lib', pdfjsError);
  }

  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  return doc.getPageCount();
}

async function rasterizeAllPages(srcBytes: Uint8Array): Promise<SplitResult> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(srcBytes) });
  const pdf = await loadingTask.promise;
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
    return rasterizeAllPages(srcBytes);
  }

  let total: number;
  try {
    total = src.getPageCount();
  } catch (e) {
    console.error('[split-pdf] pdf-lib page tree failed, falling back to raster-only', e);
    return rasterizeAllPages(srcBytes);
  }

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
 * Verify that a freshly uploaded per-page PDF parses cleanly when fetched
 * back through the media proxy. Catches the truncated/partial-upload class
 * of corruption that later surfaces in PdfInlinePreview as "Invalid PDF
 * structure". Returns true when pdfjs can parse the file.
 */
async function verifyUploadedPagePdf(url: string): Promise<boolean> {
  const fetched = await fetchPdfViaProxy(url);
  if (fetched.kind !== 'ok') return false;
  try {
    const ab = await fetched.blob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
    const ok = pdf.numPages >= 1;
    try { await pdf.destroy(); } catch { /* ignore */ }
    return ok;
  } catch {
    return false;
  }
}

/**
 * Upload a single page file to Archive.org, then verify it parses. On
 * verification failure, retry the upload up to `maxRetries` times with
 * exponential backoff. As a final attempt the page is rasterized (lossy
 * but always parseable) and re-uploaded.
 */
async function uploadAndVerifyPage(params: {
  pageFile: File;
  srcBytes: Uint8Array;
  pageIndex: number; // 0-based
  options: ArchiveUploadOptions;
  pageOptionsBase: ArchiveUploadOptions;
  onProgress?: (p: ArchiveUploadProgress) => void;
  bindController: (c: ArchiveUploadController) => void;
  isCancelled: () => boolean;
  alreadyRasterized: boolean;
}): Promise<string> {
  const {
    pageFile,
    srcBytes,
    pageIndex,
    pageOptionsBase,
    onProgress,
    bindController,
    isCancelled,
    alreadyRasterized,
  } = params;

  const maxAttempts = 3;
  let currentFile = pageFile;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isCancelled()) throw new DOMException('Upload cancelled', 'AbortError');
    try {
      const handle = uploadFileToArchiveControlled(
        currentFile,
        pageOptionsBase,
        onProgress,
      );
      bindController(handle.controller);
      const { url } = await handle.promise;

      // Give Archive.org a moment to make the file readable before we verify.
      // The fetch-media proxy already retries 404s with backoff.
      const ok = await verifyUploadedPagePdf(url);
      if (ok) return url;

      console.warn(
        `[split-pdf] page ${pageIndex + 1} failed verification (attempt ${
          attempt + 1
        }/${maxAttempts})`,
      );
    } catch (e) {
      lastError = e;
      console.warn(
        `[split-pdf] page ${pageIndex + 1} upload error (attempt ${
          attempt + 1
        }/${maxAttempts})`,
        e,
      );
    }

    // Back off before retrying.
    const backoffMs = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
    await new Promise((r) => setTimeout(r, backoffMs));

    // Final attempt: if we weren't already rasterizing, fall back to a
    // rasterized page which is guaranteed to parse.
    if (attempt === maxAttempts - 2 && !alreadyRasterized) {
      try {
        currentFile = await rasterizePageToPdf(srcBytes, pageIndex);
        console.warn(
          `[split-pdf] page ${pageIndex + 1} switching to rasterized fallback`,
        );
      } catch (e) {
        console.error(
          `[split-pdf] page ${pageIndex + 1} rasterize fallback failed`,
          e,
        );
      }
    }
  }

  throw new Error(
    `Page ${pageIndex + 1} failed verification after ${maxAttempts} attempts${
      lastError instanceof Error ? `: ${lastError.message}` : ''
    }`,
  );
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
      const pageOptionsBase: ArchiveUploadOptions = {
        ...options,
        fileName: `${pageNumber}.pdf`,
        subPath: `${base}/pages/${pageNumber}.pdf`,
      };
      const url = await uploadAndVerifyPage({
        pageFile,
        srcBytes: new Uint8Array(await file.arrayBuffer()),
        pageIndex: i,
        options,
        pageOptionsBase,
        onProgress: (p) => {
          const overall = (pagesDone + p.ratio) / (N + 1); // +1 for manifest
          onProgress?.({
            loaded: Math.round(overall * file.size),
            total: file.size,
            ratio: overall,
          });
        },
        bindController: (c) => { activeController = c; },
        isCancelled: () => cancelled,
        // We don't know if pdf-lib or raster produced this page; assume
        // pdf-lib (the common case). On verification failure we'll switch
        // to raster on the penultimate retry.
        alreadyRasterized: false,
      });
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