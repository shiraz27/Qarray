import * as pdfjsLib from 'pdfjs-dist';
import { createWorker, type Worker as TesseractWorker } from 'tesseract.js';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure PDF.js worker once (idempotent — re-assigning the same URL is a no-op).
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface ExtractPdfOptions {
  /**
   * Called as each page completes. `subRatio` reflects per-page Tesseract
   * progress (0..1) so callers can render smooth progress bars.
   */
  onPageProgress?: (pageIndex: number, totalPages: number, subRatio: number) => void;
  signal?: AbortSignal;
}

/** Whitespace-collapsed lowercase form, used to compare text-layer vs OCR. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** "Real" content: at least one letter (Latin or Arabic) and ≥10 chars. */
function isReal(s: string): boolean {
  const t = s.trim();
  return t.length >= 10 && /[a-zA-Z\u0600-\u06FF]/.test(t);
}

/** Heuristic: is the text-layer content rich enough to likely be exhaustive? */
function isVeryRichText(s: string): boolean {
  return s.trim().length >= 200 && /[a-zA-Z\u0600-\u06FF]{3,}/.test(s);
}

/**
 * Detect whether a PDF page contains embedded raster images.
 * Used to skip Tesseract on pure-text pages.
 */
async function pageHasImages(page: any): Promise<boolean> {
  try {
    const opList = await page.getOperatorList();
    const fns: number[] = opList.fnArray || [];
    const ops = (pdfjsLib as any).OPS || {};
    const imageOps = new Set<number>(
      [ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject, ops.paintJpegXObject]
        .filter((v) => typeof v === 'number') as number[]
    );
    return fns.some((fn) => imageOps.has(fn));
  } catch {
    // If we can't tell, assume yes so we still OCR.
    return true;
  }
}

async function getPageText(page: any): Promise<string> {
  try {
    const tc = await page.getTextContent();
    return (tc.items as any[]).map((it) => it.str).join(' ').trim();
  } catch (err) {
    console.warn('[pdf-ocr] text-layer read failed:', err);
    return '';
  }
}

async function renderPageToBlob(page: any): Promise<Blob> {
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport } as any).promise;
  return await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });
}

/**
 * Combine the page's text-layer content and Tesseract OCR output into the
 * final per-page string, deduping when one is contained in the other.
 */
function combinePageOutput(textLayer: string, ocr: string): string {
  const tlReal = isReal(textLayer);
  const ocrReal = isReal(ocr);

  if (tlReal && ocrReal) {
    const nT = normalize(textLayer);
    const nO = normalize(ocr);
    if (nO.includes(nT)) return ocr.trim();
    if (nT.includes(nO)) return textLayer.trim();
    return `[text layer]\n${textLayer.trim()}\n\n[ocr]\n${ocr.trim()}`;
  }
  if (tlReal) return textLayer.trim();
  if (ocrReal) return ocr.trim();
  return '[no text]';
}

/**
 * Per-page hybrid PDF extraction.
 *
 * For every page we always try the text layer; we additionally run Tesseract
 * OCR unless the page is "very rich" text-layer content with no embedded
 * raster images. Both signals are combined per-page so `ocr_text` always
 * reflects everything readable in the document.
 */
export async function extractPdfTextAndOcr(
  blob: Blob,
  opts: ExtractPdfOptions = {}
): Promise<string> {
  const { onPageProgress, signal } = opts;

  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;

  let worker: TesseractWorker | null = null;
  let currentPageIdx = 0;

  const ensureWorker = async (): Promise<TesseractWorker> => {
    if (worker) return worker;
    worker = await createWorker('eng+ara', 1, {
      logger: (m: any) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          onPageProgress?.(currentPageIdx, totalPages, m.progress);
        }
      },
    } as any);
    return worker;
  };

  const pageOutputs: string[] = [];
  let anyContent = false;

  try {
    for (let i = 1; i <= totalPages; i++) {
      if (signal?.aborted) throw new Error('Aborted');
      currentPageIdx = i - 1;
      onPageProgress?.(currentPageIdx, totalPages, 0);

      let page: any;
      try {
        page = await pdf.getPage(i);
      } catch (err: any) {
        pageOutputs.push(`--- Page ${i} ---\n[render failed: ${err?.message || err}]`);
        onPageProgress?.(currentPageIdx, totalPages, 1);
        continue;
      }

      const textLayer = await getPageText(page);

      // Decide whether to skip OCR for this page.
      let ocrText = '';
      let skipOcr = false;
      if (isVeryRichText(textLayer)) {
        const hasImg = await pageHasImages(page);
        if (!hasImg) skipOcr = true;
      }

      if (!skipOcr) {
        try {
          const imageBlob = await renderPageToBlob(page);
          const w = await ensureWorker();
          const { data } = await w.recognize(imageBlob);
          ocrText = (data.text || '').trim();
        } catch (err: any) {
          console.warn(`[pdf-ocr] page ${i} OCR failed:`, err);
          ocrText = `[ocr failed: ${err?.message || err}]`;
        }
      }

      const combined = combinePageOutput(textLayer, ocrText);
      if (combined && combined !== '[no text]') anyContent = true;
      pageOutputs.push(`--- Page ${i} ---\n${combined}`);
      onPageProgress?.(currentPageIdx, totalPages, 1);
    }

    if (!anyContent) {
      // Surface as an explicit error so caller marks status='failed' (retryable).
      throw new Error('No readable content extracted from any page');
    }

    return pageOutputs.join('\n\n');
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch { /* ignore */ }
    }
  }
}