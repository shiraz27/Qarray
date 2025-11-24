import { createWorker } from 'tesseract.js';
import { supabase } from '@/integrations/supabase/client';

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

export async function processResourceOCR(resourceId: number, mediaUrls: string[]): Promise<void> {
  const pdfOrImageUrls = mediaUrls.filter(url => {
    const lowerUrl = url.toLowerCase();
    return lowerUrl.match(/\.(jpg|jpeg|png|gif|webp)$/);
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
        const text = await processImageOCR(url);
        if (text.trim()) {
          ocrTexts.push(`--- OCR from ${url.split('/').pop()} ---\n${text}`);
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
