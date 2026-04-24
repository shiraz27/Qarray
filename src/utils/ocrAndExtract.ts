import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { supabase } from '@/integrations/supabase/client';
import { extractMediaFromText } from '@/utils/mediaHelpers';
import { extractMetadataFromOCR, ExtractedMetadata } from '@/utils/metadataExtractor';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure PDF.js worker using Vite URL import
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type FileType = 'pdf' | 'image' | 'video' | 'audio' | 'unknown';

export interface OcrAndExtractResult {
  success: boolean;
  ocrText: string;
  metadata: ExtractedMetadata;
  message: string;
}

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

/**
 * Detect file type from URL
 * Handles both standard extensions (.png) and Archive.org sanitized URLs (-png)
 */
function detectFileType(url: string): FileType {
  const lower = url.toLowerCase();

  // Check for PDF (with dot or dash for Archive.org sanitized URLs)
  if (lower.includes('.pdf') || lower.endsWith('-pdf') || lower.includes('-pdf/') || lower.includes('-pdf?')) return 'pdf';
  
  // Check for images (with dot or dash for Archive.org sanitized URLs)
  if (lower.match(/\.(jpg|jpeg|png|gif|webp)/i) || 
      lower.match(/-(jpg|jpeg|png|gif|webp)($|[/?#])/i)) return 'image';
  
  // Check for video
  if (lower.match(/\.(mp4|webm|mov)/i) || 
      lower.match(/-(mp4|webm|mov)($|[/?#])/i) ||
      lower.includes('youtube')) return 'video';
  
  // Check for audio
  if (lower.match(/\.(mp3|wav|ogg|m4a)/i) || 
      lower.match(/-(mp3|wav|ogg|m4a)($|[/?#])/i)) return 'audio';

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
 * Process OCR for uploaded media URLs and extract AI metadata
 *
 * @param mediaUrls    Remote URLs for the uploaded files (e.g. Archive.org)
 * @param onProgress   Optional progress callback
 * @param localFiles   Optional Map of url -> original File blob. When a URL has
 *                     a matching local File, we OCR it directly instead of
 *                     re-fetching from the remote host. This avoids
 *                     propagation-delay 404s and is much faster.
 */
export async function processOcrAndExtractMetadata(
  mediaUrls: string[],
  onProgress?: (message: string) => void,
  localFiles?: Map<string, File>
): Promise<OcrAndExtractResult> {
  try {
    if (mediaUrls.length === 0) {
      return {
        success: false,
        ocrText: '',
        metadata: { school_name: null, teacher_name: null, suggested_title: null, suggested_type_id: null, suggested_devoir_type_id: null, suggested_description: null },
        message: 'No media files to process'
      };
    }

    const extractedTexts: string[] = [];
    let ocrableFileCount = 0;
    let processedFileCount = 0;
    let failedFileCount = 0;

    for (let i = 0; i < mediaUrls.length; i++) {
      const url = mediaUrls[i];
      const fileType = detectFileType(url);

      onProgress?.(`Processing file ${i + 1}/${mediaUrls.length}: ${fileType}...`);

      if (fileType === 'video' || fileType === 'audio' || fileType === 'unknown') {
        continue; // Skip non-OCR-able files
      }

      ocrableFileCount++; // Count files that should be OCR-able

      try {
        // Prefer the original local File blob when available — this skips a
        // round-trip through the proxy/Archive.org and avoids propagation
        // delays right after upload.
        const localFile = localFiles?.get(url);
        const blob: Blob = localFile ?? (await fetchFileViaProxy(url));

        let text = '';

        if (fileType === 'pdf') {
          // Two-stage processing for PDFs
          text = await processPdfWithFallback(blob);
          processedFileCount++;
        } else if (fileType === 'image') {
          // Direct OCR for images
          text = await extractImageText(blob);
          processedFileCount++;
        }

        if (text) {
          extractedTexts.push(text);
        }
      } catch (error: any) {
        console.error(`Error processing ${url}:`, error);
        failedFileCount++;
        // Continue processing other files
      }
    }

    // If no OCR-able files exist at all (only video/audio)
    if (ocrableFileCount === 0) {
      return {
        success: false,
        ocrText: '',
        metadata: { school_name: null, teacher_name: null, suggested_title: null, suggested_type_id: null, suggested_devoir_type_id: null, suggested_description: null },
        message: 'No OCR-able files found (only video/audio)'
      };
    }

    // If all OCR-able files failed to fetch (e.g., archive.org propagation delay)
    if (processedFileCount === 0 && failedFileCount > 0) {
      return {
        success: false,
        ocrText: '',
        metadata: { school_name: null, teacher_name: null, suggested_title: null, suggested_type_id: null, suggested_devoir_type_id: null, suggested_description: null },
        message: `Could not fetch ${failedFileCount} file(s). Files may still be processing on the server. Please try again in a few minutes.`
      };
    }

    const combinedText = extractedTexts.join('\n\n---\n\n');
    
    onProgress?.('Extracting metadata with AI...');

    // Now extract metadata using AI
    const metadataResult = await extractMetadataFromOCR(combinedText);

    return {
      success: metadataResult.success,
      ocrText: combinedText,
      metadata: metadataResult.metadata,
      message: metadataResult.message
    };
  } catch (error: any) {
    console.error('OCR and extraction error:', error);
    return {
      success: false,
      ocrText: '',
      metadata: { school_name: null, teacher_name: null, suggested_title: null, suggested_type_id: null, suggested_devoir_type_id: null, suggested_description: null },
      message: error.message || 'Unknown error'
    };
  }
}
