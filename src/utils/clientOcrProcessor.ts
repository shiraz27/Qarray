import { createWorker } from 'tesseract.js';
import { supabase } from '@/integrations/supabase/client';
import { extractMediaFromText } from '@/utils/mediaHelpers';
import { detectMediaType, mediaTypeFromMime, type MediaType } from '@/utils/mediaTypeUtils';
import { extractPdfTextAndOcr, type OcrMode } from '@/utils/pdfOcrHelpers';

export type { OcrMode };

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
    body: JSON.stringify({ url }),
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

/**
 * Extract text from image using Tesseract.js OCR
 */
async function extractImageText(blob: Blob): Promise<string> {
  const worker = await createWorker('eng+ara+fra'); // English + Arabic + French

  try {
    const {
      data: { text },
    } = await worker.recognize(blob);
    return text.trim();
  } finally {
    await worker.terminate();
  }
}

/**
 * Main function to process OCR for a resource
 */
export async function processResourceOCR(
  resourceId: number,
  onProgress?: (message: string) => void,
  mode: OcrMode = 'mixed'
): Promise<{ success: boolean; message: string }> {
  try {
    onProgress?.(`Fetching resource #${resourceId}...`);

    // Get resource data
    const { data: resource, error } = await supabase
      .from('resources')
      .select('data')
      .eq('id', resourceId)
      .single();

    if (error || !resource) throw new Error('Resource not found');

    // Extract media URLs from data field
    const mediaFiles = extractMediaFromText(
      Array.isArray(resource.data) ? resource.data.join('\n') : resource.data
    ).media;

    if (mediaFiles.length === 0) {
      // No media to process
      await supabase
        .from('resources')
        .update({
          ocr_status: 'not_applicable',
          ocr_text: 'No media files found',
          ocr_processed_at: new Date().toISOString(),
        })
        .eq('id', resourceId);

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

    for (let i = 0; i < mediaFiles.length; i++) {
      const mediaFile = mediaFiles[i];
      let fileType = detectFileType(mediaFile.url);

      onProgress?.(
        `Processing file ${i + 1}/${mediaFiles.length}: ${fileType}...`
      );

      if (fileType === 'video' || fileType === 'audio') {
        nonOcrableFileCount++;
        extractedTexts.push(
          `[${fileType.toUpperCase()} FILE - OCR not applicable]`
        );
        continue;
      }

      // For URLs we already know are OCR-able (pdf/image), count them as
      // processable BEFORE the fetch — otherwise a fetch failure leaves the
      // file uncounted and the resource may end up tagged `not_applicable`.
      if (fileType === 'pdf' || fileType === 'image') {
        processableFileCount++;
      }

      try {
        // Fetch file via proxy. For unknown URL types, the response
        // Content-Type is our last chance to classify the file.
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
          text = await extractPdfTextAndOcr(blob, { mode });
          ocrableFileCount++;
        } else if (fileType === 'image') {
          if (mode === 'text') {
            // Standalone images have no text layer — skip in text-only mode
            imagesSkippedTextMode++;
            extractedTexts.push('[Image — skipped in text-only mode]');
            continue;
          }
          text = await extractImageText(blob);
          ocrableFileCount++;
        }

        extractedTexts.push(text || '[No text extracted]');
      } catch (error) {
        console.error(`Error processing ${mediaFile.url}:`, error);
        fetchFailedCount++;
        hadFetchFailure = true;
        extractedTexts.push(`[Error: ${error.message}]`);
      }
    }

    // Combine all extracted text
    const header = `[OCR mode: ${mode}]`;
    const combinedText = [header, extractedTexts.join('\n\n---\n\n')].join('\n\n');

    // Determine OCR status based on file types
    let ocrStatus: 'completed' | 'not_applicable' | 'failed';
    let ocrText: string;

    if (ocrableFileCount === 0) {
      if (hadFetchFailure) {
        // Any fetch failure on an OCR-able URL is retryable (e.g. Archive.org
        // derivative still propagating). Never mark such resources as
        // `not_applicable`.
        ocrStatus = 'failed';
        ocrText = `Some files could not be fetched yet (Archive.org may still be processing) — please retry.\n\n${combinedText}`;
      } else
      if (processableFileCount > 0 && fetchFailedCount === processableFileCount) {
        // All PDF/image fetches failed (e.g. Archive.org not yet propagated) — retryable
        ocrStatus = 'failed';
        ocrText = `All file fetches failed — please retry.\n\n${combinedText}`;
      } else if (imagesSkippedTextMode > 0 && unknownFileCount === 0 && nonOcrableFileCount === 0) {
        // Text-only mode on an image-only resource: nothing to do, but not an error.
        ocrStatus = 'not_applicable';
        ocrText = `Image-only resource — text-only mode skipped all files.\n\n${combinedText}`;
      } else if (unknownFileCount > 0 && nonOcrableFileCount === 0) {
        // Could not detect any file type — mark failed so it's retryable
        ocrStatus = 'failed';
        ocrText = `Could not detect file type for any attachment — please retry.\n\n${combinedText}`;
      } else {
        // Genuinely non-OCR-able (video/audio only, or no processable media)
        ocrStatus = 'not_applicable';
        ocrText = 'Contains only video/audio files - OCR not applicable';
      }
    } else {
      // At least one file was OCR-able. If others failed to fetch, still mark
      // as failed so the user knows to retry.
      ocrStatus = hadFetchFailure ? 'failed' : 'completed';
      ocrText = combinedText;
    }

    // Update resource in database
    await supabase
      .from('resources')
      .update({
        ocr_status: ocrStatus,
        ocr_text: ocrText,
        ocr_processed_at: new Date().toISOString(),
      })
      .eq('id', resourceId);

    return { success: true, message: 'OCR completed successfully' };
  } catch (error) {
    console.error('OCR processing error:', error);

    // Mark as failed in database
    await supabase
      .from('resources')
      .update({
        ocr_status: 'failed',
        ocr_text: `Error: ${error.message}`,
        ocr_processed_at: new Date().toISOString(),
      })
      .eq('id', resourceId);

    return { success: false, message: error.message };
  }
}
