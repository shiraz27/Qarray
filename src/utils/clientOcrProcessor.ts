import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { supabase } from '@/integrations/supabase/client';
import { extractMediaFromText } from '@/utils/mediaHelpers';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

type FileType = 'pdf' | 'image' | 'video' | 'audio' | 'unknown';

/**
 * Fetch file via proxy to bypass CORS
 */
async function fetchFileViaProxy(url: string): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('fetch-media', {
    body: { url },
  });

  if (error) throw new Error(`Failed to fetch file: ${error.message}`);
  return data;
}

/**
 * Detect file type from URL
 */
function detectFileType(url: string): FileType {
  const lower = url.toLowerCase();

  if (lower.includes('.pdf')) return 'pdf';
  if (lower.match(/\.(jpg|jpeg|png|gif|webp)/i)) return 'image';
  if (lower.match(/\.(mp4|webm|mov)/i) || lower.includes('youtube')) return 'video';
  if (lower.match(/\.(mp3|wav|webm|ogg|m4a)/i)) return 'audio';

  return 'unknown';
}

/**
 * Extract text from PDF using pdfjs-dist
 */
async function extractPdfText(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }

  return fullText.trim();
}

/**
 * Extract text from image using Tesseract.js OCR
 */
async function extractImageText(blob: Blob): Promise<string> {
  const worker = await createWorker('eng+ara'); // English + Arabic

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
 * Convert PDF pages to images and OCR them
 */
async function ocrPdfPages(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const worker = await createWorker('eng+ara');
  let fullText = '';

  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });

      // Create canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Render PDF page to canvas
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      await page.render(renderContext as any).promise;

      // Convert canvas to blob
      const imageBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/png');
      });

      // OCR the image
      const {
        data: { text },
      } = await worker.recognize(imageBlob);
      fullText += text + '\n\n';
    }

    return fullText.trim();
  } finally {
    await worker.terminate();
  }
}

/**
 * Two-stage PDF processing: Extract text first, then OCR if needed
 */
async function processPdfWithFallback(blob: Blob): Promise<string> {
  console.log('Stage 1: Attempting text extraction from PDF...');

  // Stage 1: Try to extract text
  const extractedText = await extractPdfText(blob);

  // Check if we got meaningful text (more than 50 chars with real words)
  const hasRealText =
    extractedText.length > 50 &&
    /[a-zA-Z\u0600-\u06FF]{3,}/.test(extractedText);

  if (hasRealText) {
    console.log('Stage 1: Success! Text extracted from PDF');
    return extractedText;
  }

  console.log(
    'Stage 2: No text layer found. Treating as scanned PDF, running OCR...'
  );

  // Stage 2: Fallback to OCR for scanned PDFs
  return await ocrPdfPages(blob);
}

/**
 * Main function to process OCR for a resource
 */
export async function processResourceOCR(
  resourceId: number,
  onProgress?: (message: string) => void
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

    for (let i = 0; i < mediaFiles.length; i++) {
      const mediaFile = mediaFiles[i];
      const fileType = detectFileType(mediaFile.url);

      onProgress?.(
        `Processing file ${i + 1}/${mediaFiles.length}: ${fileType}...`
      );

      if (fileType === 'video' || fileType === 'audio') {
        extractedTexts.push(
          `[${fileType.toUpperCase()} FILE - OCR not applicable]`
        );
        continue;
      }

      try {
        // Fetch file via proxy
        const blob = await fetchFileViaProxy(mediaFile.url);

        let text = '';

        if (fileType === 'pdf') {
          // Two-stage processing for PDFs
          text = await processPdfWithFallback(blob);
        } else if (fileType === 'image') {
          // Direct OCR for images
          text = await extractImageText(blob);
        }

        extractedTexts.push(text || '[No text extracted]');
      } catch (error) {
        console.error(`Error processing ${mediaFile.url}:`, error);
        extractedTexts.push(`[Error: ${error.message}]`);
      }
    }

    // Combine all extracted text
    const combinedText = extractedTexts.join('\n\n---\n\n');

    // Update resource in database
    await supabase
      .from('resources')
      .update({
        ocr_status: 'completed',
        ocr_text: combinedText,
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
