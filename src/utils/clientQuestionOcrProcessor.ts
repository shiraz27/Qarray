import { createWorker } from 'tesseract.js';
import { supabase } from '@/integrations/supabase/client';
import { extractMediaFromText } from '@/utils/mediaHelpers';
import { detectMediaType, mediaTypeFromMime, type MediaType } from '@/utils/mediaTypeUtils';
import {
  extractPdfTextAndOcr,
  detectOcrLanguage,
  DEFAULT_OCR_LANGS,
  type OcrMode,
  type OcrPsm,
} from '@/utils/pdfOcrHelpers';
import { expandManifestUrls } from '@/utils/splitPdfManifest';
import { encodeMediaUrl } from '@/utils/mediaToken';
import { computeReadability } from '@/utils/ocrReadability';
import { writeOcrResult } from '@/utils/ocrProposalWrite';

export interface OcrRunOptions {
  langs?: string;
  psm?: OcrPsm;
  contextHint?: string;
}

type FileType = MediaType;

/**
 * Fetch file via proxy to bypass CORS
 */
async function fetchFileViaProxy(url: string): Promise<Blob> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  const response = await fetch(`${supabaseUrl}/functions/v1/fetch-media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ token: encodeMediaUrl(url) }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch file: ${errorText}`);
  }

  // The proxy returns 200 with a JSON `{ unavailable: true }` payload when the
  // upstream (Archive.org) is still 404-ing after retries. Detect that here so
  // callers can treat it as a normal handled error instead of a binary blob.
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null) as { unavailable?: boolean; error?: string } | null;
    if (payload?.unavailable) {
      throw new Error(payload.error || 'File not available yet');
    }
  }

  return await response.blob();
}

const detectFileType = detectMediaType;

/** Upscale small images so Tesseract has enough pixels per glyph. */
async function maybeUpscale(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width >= 1000) { bitmap.close?.(); return blob; }
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b ?? blob), 'image/png');
    });
  } catch {
    return blob;
  }
}

/** French-default standalone image OCR with majority-script switching. */
async function extractImageText(
  blob: Blob,
  runOpts: OcrRunOptions = {},
): Promise<string> {
  const prepared = await maybeUpscale(blob);
  const forcedLangs = runOpts.langs && runOpts.langs.trim() ? runOpts.langs.trim() : null;
  const psm: OcrPsm = runOpts.psm ?? '6';
  let langs = forcedLangs ?? DEFAULT_OCR_LANGS;
  let worker = await createWorker(langs);
  try {
    try {
      await (worker as any).setParameters?.({
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
        tessedit_pageseg_mode: psm,
      });
    } catch { /* ignore */ }
    const first = await worker.recognize(prepared);
    const text1 = (first.data.text || '').trim();
    const { langs: bestLangs, label } = forcedLangs
      ? { langs, label: detectOcrLanguage(text1).label }
      : detectOcrLanguage(text1);
    if (bestLangs !== langs) {
      langs = bestLangs;
      try { await worker.terminate(); } catch { /* ignore */ }
      worker = await createWorker(langs);
      try {
        await (worker as any).setParameters?.({
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
          tessedit_pageseg_mode: psm,
        });
      } catch { /* ignore */ }
      const second = await worker.recognize(prepared);
      return `[image langs: ${langs}${forcedLangs ? ' (forced)' : ''} | psm: ${psm} | detected: ${label}]\n${(second.data.text || '').trim()}`;
    }
    return `[image langs: ${langs}${forcedLangs ? ' (forced)' : ''} | psm: ${psm} | detected: ${label}]\n${text1}`;
  } finally {
    try { await worker.terminate(); } catch { /* ignore */ }
  }
}

/**
 * Main function to process OCR for a question
 */
export async function processQuestionOCR(
  questionId: number,
  onProgress?: (message: string) => void,
  mode: OcrMode = 'mixed',
  runOpts: OcrRunOptions = {},
): Promise<{ success: boolean; message: string }> {
  try {
    onProgress?.(`Fetching question #${questionId}...`);

    // Get question data
    const { data: question, error } = await supabase
      .from('questions')
      .select('data')
      .eq('id', questionId)
      .single();

    if (error || !question) throw new Error('Question not found');

    // Extract media URLs from data field (questions have a single text field)
    const mediaFiles = extractMediaFromText(question.data).media;

    // Expand split-PDF manifests to per-page URLs.
    const expandedUrls = await expandManifestUrls(mediaFiles.map((m) => m.url));
    const expandedFiles = expandedUrls.map((url) => ({ url }));

    if (expandedFiles.length === 0) {
      // No media to process
      await writeOcrResult('questions', questionId, {
        status: 'not_applicable',
        text: 'No media files found',
      });
      return { success: true, message: 'No media to process' };
    }

    const extractedTexts: string[] = [];
    let ocrableFileCount = 0;
    let nonOcrableFileCount = 0;
    let unknownFileCount = 0;
    let fetchFailedCount = 0;
    let processableFileCount = 0;
    let hadFetchFailure = false;
    let imagesSkippedTextMode = 0;

    for (let i = 0; i < expandedFiles.length; i++) {
      const mediaFile = expandedFiles[i];
      let fileType = detectFileType(mediaFile.url);

      onProgress?.(
        `Processing file ${i + 1}/${expandedFiles.length}: ${fileType}...`
      );

      if (fileType === 'video' || fileType === 'audio') {
        nonOcrableFileCount++;
        extractedTexts.push(
          `[${fileType.toUpperCase()} FILE - OCR not applicable]`
        );
        continue;
      }

      if (fileType === 'pdf' || fileType === 'image') {
        processableFileCount++;
      }

      try {
        const blob = await fetchFileViaProxy(mediaFile.url);

        if (fileType === 'unknown') {
          const mimeType = mediaTypeFromMime(blob.type);
          if (mimeType === 'pdf' || mimeType === 'image') {
            console.log(
              `URL had unknown extension, but server returned ${blob.type}. Treating as ${mimeType}.`
            );
            fileType = mimeType;
            processableFileCount++;
          } else if (mimeType === 'video' || mimeType === 'audio') {
            nonOcrableFileCount++;
            extractedTexts.push(
              `[${mimeType.toUpperCase()} FILE - OCR not applicable]`
            );
            continue;
          } else {
            unknownFileCount++;
            extractedTexts.push(
              `[Unknown file type - URL: ${mediaFile.url}, server returned: ${blob.type || 'no content-type'}]`
            );
            continue;
          }
        }

        let text = '';

        if (fileType === 'pdf') {
          text = await extractPdfTextAndOcr(blob, {
            mode,
            langs: runOpts.langs,
            psm: runOpts.psm,
            contextHint: runOpts.contextHint,
          });
          ocrableFileCount++;
        } else if (fileType === 'image') {
          if (mode === 'text') {
            imagesSkippedTextMode++;
            extractedTexts.push('[Image — skipped in text-only mode]');
            continue;
          }
          text = await extractImageText(blob, runOpts);
          ocrableFileCount++;
        }

        extractedTexts.push(text || '[No text extracted]');
      } catch (error: any) {
        console.error(`Error processing ${mediaFile.url}:`, error);
        fetchFailedCount++;
        hadFetchFailure = true;
        extractedTexts.push(`[Error: ${error.message}]`);
      }
    }

    // Combine all extracted text
    const headerLines = [`[OCR mode: ${mode}${runOpts.langs ? ` | langs: ${runOpts.langs} (forced)` : ''}${runOpts.psm ? ` | psm: ${runOpts.psm}` : ''}]`];
    if (runOpts.contextHint && runOpts.contextHint.trim()) {
      headerLines.push(`[context: ${runOpts.contextHint.trim()}]`);
    }
    const combinedText = [headerLines.join('\n'), extractedTexts.join('\n\n---\n\n')].join('\n\n');

    // Determine OCR status based on file types
    let ocrStatus: 'completed' | 'not_applicable' | 'failed';
    let ocrText: string;

    if (ocrableFileCount === 0) {
      if (hadFetchFailure) {
        ocrStatus = 'failed';
        ocrText = `Some files could not be fetched yet (Archive.org may still be processing) — please retry.\n\n${combinedText}`;
      } else if (processableFileCount > 0 && fetchFailedCount === processableFileCount) {
        ocrStatus = 'failed';
        ocrText = `All file fetches failed — please retry.\n\n${combinedText}`;
      } else if (imagesSkippedTextMode > 0 && unknownFileCount === 0 && nonOcrableFileCount === 0) {
        ocrStatus = 'not_applicable';
        ocrText = `Image-only question — text-only mode skipped all files.\n\n${combinedText}`;
      } else if (unknownFileCount > 0 && nonOcrableFileCount === 0) {
        ocrStatus = 'failed';
        ocrText = `Could not detect file type for any attachment — please retry.\n\n${combinedText}`;
      } else {
        ocrStatus = 'not_applicable';
        ocrText = 'Contains only video/audio files - OCR not applicable';
      }
    } else {
      ocrStatus = hadFetchFailure ? 'failed' : 'completed';
      ocrText = combinedText;
    }

    // Update question in database (proposal flow when prior OCR exists)
    const { proposed } = await writeOcrResult('questions', questionId, {
      status: ocrStatus,
      text: ocrText,
    });
    return {
      success: true,
      message: proposed
        ? 'OCR completed — pending admin review'
        : 'OCR completed successfully',
    };
  } catch (error: any) {
    console.error('OCR processing error:', error);

    // Mark as failed in database (failures bypass proposal flow)
    await writeOcrResult('questions', questionId, {
      status: 'failed',
      text: `Error: ${error.message}`,
    });
    return { success: false, message: error.message };
  }
}
