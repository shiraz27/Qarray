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

  return await response.blob();
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
 * Process OCR for uploaded media URLs and extract AI metadata
 */
export async function processOcrAndExtractMetadata(
  mediaUrls: string[],
  onProgress?: (message: string) => void
): Promise<OcrAndExtractResult> {
  try {
    if (mediaUrls.length === 0) {
      return {
        success: false,
        ocrText: '',
        metadata: { school_name: null, teacher_name: null, suggested_title: null, suggested_type_id: null, suggested_devoir_type_id: null },
        message: 'No media files to process'
      };
    }

    const extractedTexts: string[] = [];
    let ocrableFileCount = 0;

    for (let i = 0; i < mediaUrls.length; i++) {
      const url = mediaUrls[i];
      const fileType = detectFileType(url);

      onProgress?.(`Processing file ${i + 1}/${mediaUrls.length}: ${fileType}...`);

      if (fileType === 'video' || fileType === 'audio' || fileType === 'unknown') {
        continue; // Skip non-OCR-able files
      }

      try {
        // Fetch file via proxy
        const blob = await fetchFileViaProxy(url);

        let text = '';

        if (fileType === 'pdf') {
          // Two-stage processing for PDFs
          text = await processPdfWithFallback(blob);
          ocrableFileCount++;
        } else if (fileType === 'image') {
          // Direct OCR for images
          text = await extractImageText(blob);
          ocrableFileCount++;
        }

        if (text) {
          extractedTexts.push(text);
        }
      } catch (error: any) {
        console.error(`Error processing ${url}:`, error);
      }
    }

    if (ocrableFileCount === 0) {
      return {
        success: false,
        ocrText: '',
        metadata: { school_name: null, teacher_name: null, suggested_title: null, suggested_type_id: null, suggested_devoir_type_id: null },
        message: 'No OCR-able files found (only video/audio)'
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
      metadata: { school_name: null, teacher_name: null, suggested_title: null, suggested_type_id: null, suggested_devoir_type_id: null },
      message: error.message || 'Unknown error'
    };
  }
}
