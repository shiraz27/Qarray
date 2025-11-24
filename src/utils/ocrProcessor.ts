import { createWorker } from 'tesseract.js';
import { supabase } from '@/integrations/supabase/client';
import * as pdfjsLib from 'pdfjs-dist';

export async function processImageOCR(imageUrl: string): Promise<string> {
  try {
    console.log('Starting OCR processing for:', imageUrl);
    const worker = await createWorker('eng');
    const result = await worker.recognize(imageUrl);
    await worker.terminate();
    console.log('OCR completed, extracted text length:', result.data.text.length);
    return result.data.text;
  } catch (error) {
    console.error('OCR processing error:', error);
    throw error;
  }
}

export async function processPDFOCR(pdfUrl: string): Promise<string> {
  try {
    console.log('Starting PDF OCR processing for:', pdfUrl);
    
    // Set worker path for PDF.js
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    
    // Load PDF
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdf = await loadingTask.promise;
    const allText: string[] = [];
    
    console.log(`PDF loaded, processing ${pdf.numPages} pages...`);
    
    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        
        // Create canvas from page
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Could not get canvas context');
        }
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({ canvasContext: context, viewport }).promise;
        
        // Convert canvas to image URL and run OCR
        const imageUrl = canvas.toDataURL('image/png');
        console.log(`Processing OCR for page ${pageNum}/${pdf.numPages}`);
        const text = await processImageOCR(imageUrl);
        
        if (text.trim()) {
          allText.push(`--- Page ${pageNum} ---\n${text}`);
        }
      } catch (pageError) {
        console.error(`Failed to process page ${pageNum}:`, pageError);
        allText.push(`--- Page ${pageNum} ---\n[Error processing page]`);
      }
    }
    
    const combinedText = allText.join('\n\n');
    console.log('PDF OCR completed, total text length:', combinedText.length);
    return combinedText;
  } catch (error) {
    console.error('PDF OCR processing error:', error);
    throw error;
  }
}

export async function processResourceOCR(resourceId: number, mediaUrls: string[]): Promise<void> {
  const pdfOrImageUrls = mediaUrls.filter(url => {
    const lowerUrl = url.toLowerCase();
    return lowerUrl.match(/\.(pdf|jpg|jpeg|png|gif|webp)$/);
  });

  if (pdfOrImageUrls.length === 0) {
    await supabase
      .from('resources')
      .update({ 
        ocr_status: 'not_applicable',
        ocr_processed_at: new Date().toISOString()
      })
      .eq('id', resourceId);
    return;
  }

  try {
    await supabase
      .from('resources')
      .update({ ocr_status: 'processing' })
      .eq('id', resourceId);

    const ocrTexts: string[] = [];
    
    for (const url of pdfOrImageUrls) {
      try {
        let text: string;
        const fileName = url.split('/').pop() || 'unknown';
        
        // Route to appropriate processor based on file type
        if (url.toLowerCase().endsWith('.pdf')) {
          console.log(`Processing PDF: ${fileName}`);
          text = await processPDFOCR(url);
        } else {
          console.log(`Processing image: ${fileName}`);
          text = await processImageOCR(url);
        }
        
        if (text.trim()) {
          ocrTexts.push(`--- OCR from ${fileName} ---\n${text}`);
        }
      } catch (error) {
        console.error(`Failed to process ${url}:`, error);
      }
    }

    const combinedText = ocrTexts.join('\n\n');

    await supabase
      .from('resources')
      .update({
        ocr_text: combinedText || 'No text extracted',
        ocr_status: 'completed',
        ocr_processed_at: new Date().toISOString()
      })
      .eq('id', resourceId);

  } catch (error) {
    console.error('OCR processing failed:', error);
    await supabase
      .from('resources')
      .update({
        ocr_status: 'failed',
        ocr_processed_at: new Date().toISOString()
      })
      .eq('id', resourceId);
    throw error;
  }
}
