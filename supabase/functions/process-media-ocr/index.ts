import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createWorker } from 'https://esm.sh/tesseract.js@5.0.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OcrRequest {
  resourceId: number;
  mediaUrl: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { resourceId, mediaUrl }: OcrRequest = await req.json();

    console.log(`Starting OCR processing for resource ${resourceId}`);

    // Update status to processing
    await supabaseClient
      .from('resources')
      .update({ ocr_status: 'processing' })
      .eq('id', resourceId);

    // Determine media type
    const lowerUrl = mediaUrl.toLowerCase();
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(lowerUrl);
    const isPdf = lowerUrl.endsWith('.pdf');

    let extractedText = '';
    const worker = await createWorker('eng');

    try {
      if (isImage) {
        // Process image directly with Tesseract
        console.log(`Processing image: ${mediaUrl}`);
        const result = await worker.recognize(mediaUrl);
        extractedText = result.data.text;
      } else if (isPdf) {
        // PDF processing - simplified placeholder
        // In production, you'd convert PDF pages to images first
        console.log(`PDF processing not yet fully implemented for: ${mediaUrl}`);
        extractedText = `PDF content extraction in progress for resource ${resourceId}`;
      }

      await worker.terminate();

      // Update resource with OCR text
      await supabaseClient
        .from('resources')
        .update({
          ocr_text: extractedText,
          ocr_status: 'completed',
          ocr_processed_at: new Date().toISOString(),
        })
        .eq('id', resourceId);

      console.log(`Successfully processed OCR for resource ${resourceId}`);

      return new Response(
        JSON.stringify({
          success: true,
          resourceId,
          textLength: extractedText.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (ocrError) {
      console.error('OCR processing error:', ocrError);
      
      await supabaseClient
        .from('resources')
        .update({
          ocr_status: 'failed',
          ocr_processed_at: new Date().toISOString(),
        })
        .eq('id', resourceId);

      throw ocrError;
    }
  } catch (error) {
    console.error('Error in process-media-ocr:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
