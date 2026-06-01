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
  /**
   * OCR pipeline:
   *  - 'text'  : text-layer extraction only (no Tesseract). Fastest.
   *  - 'image' : render each page → Tesseract only (no text layer).
   *  - 'mixed' : both, combined per-page (default; most thorough).
   */
  mode?: OcrMode;
  /**
   * Force a Tesseract language pack (e.g. "fra", "ara", "eng", "fra+ara").
   * When provided, the automatic French/Arabic/English probe is skipped.
   */
  langs?: string;
  /**
   * Page segmentation mode passed to Tesseract. Defaults to '6'
   * (single uniform block of text) which works for most school PDFs.
   *  - '3'  : fully automatic page segmentation
   *  - '4'  : single column of text of variable sizes
   *  - '6'  : assume a single uniform block of text
   *  - '11' : sparse text — find as much text as possible in no particular order
   */
  psm?: OcrPsm;
  /**
   * Free-form context written into the OCR header (chapter, subject, book,
   * teacher, language notes…). Does NOT influence Tesseract directly but is
   * persisted alongside the result so downstream AI prompts (descriptions,
   * proposals) can leverage it.
   */
  contextHint?: string;
}

export type OcrMode = 'text' | 'image' | 'mixed';
export type OcrPsm = '3' | '4' | '6' | '11';

/**
 * Default OCR language pack. Tunisian scientific subjects are taught in French,
 * so French is the primary language. We always include Arabic and English so
 * detection works without re-loading a worker.
 */
export const DEFAULT_OCR_LANGS = 'fra+ara+eng';

/**
 * Inspect a sample of OCR output and choose the best language pack ordering.
 * Default is French-first; switch to Arabic-first when Arabic dominates, or
 * English-first when common English stopwords dominate the Latin text.
 */
export function detectOcrLanguage(sample: string): {
  langs: string;
  label: 'french-default' | 'arabic-majority' | 'english-majority';
} {
  const s = (sample ?? '').trim();
  if (!s) return { langs: DEFAULT_OCR_LANGS, label: 'french-default' };

  let arabic = 0, latin = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 0x0600 && c <= 0x06FF) arabic++;
    else if (/[a-zA-ZÀ-ÿ]/.test(ch)) latin++;
  }
  const totalLetters = arabic + latin;
  if (totalLetters > 0 && arabic / totalLetters > 0.4) {
    return { langs: 'ara+fra+eng', label: 'arabic-majority' };
  }

  // English-majority detection: count English stopwords vs total Latin words.
  const ENGLISH_STOPWORDS = new Set([
    'the','of','and','is','are','this','with','for','from','that','was','were',
    'have','has','not','but','you','your','what','which','their','they','it','an',
  ]);
  const latinWords = s
    .toLowerCase()
    .split(/[^a-zà-ÿ]+/i)
    .filter((w) => w.length > 1);
  if (latinWords.length >= 20) {
    const hits = latinWords.filter((w) => ENGLISH_STOPWORDS.has(w)).length;
    if (hits / latinWords.length > 0.08) {
      return { langs: 'eng+fra+ara', label: 'english-majority' };
    }
  }
  return { langs: DEFAULT_OCR_LANGS, label: 'french-default' };
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
  // Use 3x scale when the source page is small (poor DPI) so diacritics survive.
  const baseViewport = page.getViewport({ scale: 1.0 });
  const scale = baseViewport.width < 1200 ? 3.0 : 2.0;
  const viewport = page.getViewport({ scale });
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
  const { onPageProgress, signal, mode = 'mixed' } = opts;

  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;

  let worker: TesseractWorker | null = null;
  let workerLangs: string = DEFAULT_OCR_LANGS;
  let currentPageIdx = 0;
  let detectedLabel: 'french-default' | 'arabic-majority' | 'english-majority' =
    'french-default';

  const buildWorker = async (langs: string): Promise<TesseractWorker> => {
    const w = await createWorker(langs, 1, {
      logger: (m: any) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          onPageProgress?.(currentPageIdx, totalPages, m.progress);
        }
      },
    } as any);
    try {
      await (w as any).setParameters?.({
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
        tessedit_pageseg_mode: '6',
      });
    } catch { /* ignore */ }
    return w;
  };

  const ensureWorker = async (langs?: string): Promise<TesseractWorker> => {
    const target = langs ?? workerLangs;
    if (worker && workerLangs === target) return worker;
    if (worker) {
      try { await worker.terminate(); } catch { /* ignore */ }
      worker = null;
    }
    workerLangs = target;
    worker = await buildWorker(target);
    return worker;
  };

  const recognizeWithRetry = async (
    w: TesseractWorker,
    imageBlob: Blob,
  ): Promise<string> => {
    const { data } = await w.recognize(imageBlob);
    const txt = (data.text || '').trim();
    if (txt.length >= 20) return txt;
    // Retry once with automatic page segmentation for sparse-text pages.
    try {
      await (w as any).setParameters?.({ tessedit_pageseg_mode: '3' });
      const { data: data2 } = await w.recognize(imageBlob);
      await (w as any).setParameters?.({ tessedit_pageseg_mode: '6' });
      return (data2.text || '').trim() || txt;
    } catch {
      return txt;
    }
  };

  const pageOutputs: string[] = [];
  let anyContent = false;

  try {
    // ----- Language probe on page 1 (image/mixed only) -----
    let probeOcrPage1 = '';
    let probeTextLayerPage1 = '';
    if (mode !== 'text' && totalPages >= 1) {
      try {
        const probePage = await pdf.getPage(1);
        probeTextLayerPage1 = mode === 'image' ? '' : await getPageText(probePage);
        const probeBlob = await renderPageToBlob(probePage);
        const probeWorker = await ensureWorker(DEFAULT_OCR_LANGS);
        probeOcrPage1 = await recognizeWithRetry(probeWorker, probeBlob);
        const probeSample = `${probeTextLayerPage1}\n${probeOcrPage1}`;
        const { langs, label } = detectOcrLanguage(probeSample);
        detectedLabel = label;
        if (langs !== workerLangs) {
          // Re-OCR page 1 with the chosen pack so its result reflects it.
          const w2 = await ensureWorker(langs);
          probeOcrPage1 = await recognizeWithRetry(w2, probeBlob);
        }
      } catch (err) {
        console.warn('[pdf-ocr] language probe failed:', err);
      }
    } else if (mode === 'text') {
      // Pure text-layer mode — pick a label from the first page text.
      try {
        const probePage = await pdf.getPage(1);
        probeTextLayerPage1 = await getPageText(probePage);
        detectedLabel = detectOcrLanguage(probeTextLayerPage1).label;
      } catch { /* ignore */ }
    }

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

      const textLayer = i === 1
        ? probeTextLayerPage1
        : (mode === 'image' ? '' : await getPageText(page));

      let ocrText = '';
      if (mode === 'image' || mode === 'mixed') {
        if (i === 1 && probeOcrPage1) {
          ocrText = probeOcrPage1;
        } else {
          try {
            const imageBlob = await renderPageToBlob(page);
            const w = await ensureWorker();
            ocrText = await recognizeWithRetry(w, imageBlob);
          } catch (err: any) {
            console.warn(`[pdf-ocr] page ${i} OCR failed:`, err);
            ocrText = `[ocr failed: ${err?.message || err}]`;
          }
        }
      }

      const combined = combinePageOutput(textLayer, ocrText);
      if (combined && combined !== '[no text]') anyContent = true;
      pageOutputs.push(`--- Page ${i} ---\n${combined}`);
      onPageProgress?.(currentPageIdx, totalPages, 1);
    }

    if (!anyContent) {
      const reason =
        mode === 'text'
          ? 'No readable text layer (try Image or Mixed mode for scanned PDFs)'
          : 'No readable content extracted from any page';
      throw new Error(reason);
    }

    const header = `[OCR mode: ${mode} | langs: ${workerLangs} | detected: ${detectedLabel}]`;
    return [header, pageOutputs.join('\n\n')].join('\n\n');
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch { /* ignore */ }
    }
  }
}