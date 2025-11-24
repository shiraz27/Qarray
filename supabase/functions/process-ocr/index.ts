import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createWorker } from 'https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessOCRRequest {
  resourceId: number;
  mediaUrls: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { resourceId, mediaUrls }: ProcessOCRRequest = await req.json();

    console.log(`Starting OCR processing for resource ${resourceId}`);
    console.log(`Media URLs:`, mediaUrls);

    // Filter for processable files (PDF and images)
    const processableUrls = mediaUrls.filter(url => {
      const lowerUrl = url.toLowerCase();
      return lowerUrl.match(/\.(pdf|jpg|jpeg|png|gif|webp)$/);
    });

    // Check for non-processable media (videos, audio)
    const nonProcessableUrls = mediaUrls.filter(url => {
      const lowerUrl = url.toLowerCase();
      return lowerUrl.match(/\.(webm|mp4|mov|avi|mp3|wav|ogg|m4a)$/);
    });

    if (nonProcessableUrls.length > 0) {
      console.log(`Resource ${resourceId} contains non-processable files (video/audio):`, nonProcessableUrls);
      await supabaseClient
        .from('resources')
        .update({ 
          ocr_status: 'not_applicable',
          ocr_text: 'Video/audio files cannot be processed with OCR',
          ocr_processed_at: new Date().toISOString()
        })
        .eq('id', resourceId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Resource contains video/audio files - marked as not applicable',
          status: 'not_applicable'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (processableUrls.length === 0) {
      console.log(`Resource ${resourceId} has no processable files`);
      await supabaseClient
        .from('resources')
        .update({ 
          ocr_status: 'not_applicable',
          ocr_text: 'No PDF or image files to process',
          ocr_processed_at: new Date().toISOString()
        })
        .eq('id', resourceId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No processable files found',
          status: 'not_applicable'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update status to processing
    await supabaseClient
      .from('resources')
      .update({ ocr_status: 'processing' })
      .eq('id', resourceId);

    console.log(`Processing ${processableUrls.length} files for resource ${resourceId}`);

    // Initialize Tesseract worker
    const worker = await createWorker('eng');
    const ocrTexts: string[] = [];

    // Process each file
    for (const url of processableUrls) {
      try {
        const fileName = url.split('/').pop() || 'unknown';
        console.log(`Fetching ${fileName}...`);

        // Fetch the file (server-side = no CORS issues)
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`Failed to fetch ${fileName}: ${response.status}`);
          ocrTexts.push(`--- Error fetching ${fileName} ---\n[HTTP ${response.status}]`);
          continue;
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        console.log(`Processing OCR for ${fileName} (${buffer.length} bytes)`);

        // For images, process directly
        if (url.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/)) {
          const result = await worker.recognize(buffer);
          const text = result.data.text.trim();
          
          if (text) {
            ocrTexts.push(`--- OCR from ${fileName} ---\n${text}`);
            console.log(`Extracted ${text.length} characters from ${fileName}`);
          } else {
            console.log(`No text found in ${fileName}`);
          }
        } 
        // For PDFs, we'll extract text directly (PDF.js would be too heavy for edge function)
        else if (url.toLowerCase().endsWith('.pdf')) {
          // For now, mark PDFs as needing special handling
          console.log(`PDF processing not yet implemented for ${fileName}`);
          ocrTexts.push(`--- ${fileName} ---\n[PDF processing requires additional setup]`);
        }

      } catch (error) {
        console.error(`Failed to process ${url}:`, error);
        const fileName = url.split('/').pop() || 'unknown';
        ocrTexts.push(`--- Error processing ${fileName} ---\n${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    await worker.terminate();

    const combinedText = ocrTexts.length > 0 ? ocrTexts.join('\n\n') : 'No text extracted';

    // Update resource with results
    await supabaseClient
      .from('resources')
      .update({
        ocr_text: combinedText,
        ocr_status: 'completed',
        ocr_processed_at: new Date().toISOString()
      })
      .eq('id', resourceId);

    console.log(`OCR completed for resource ${resourceId}: ${combinedText.length} characters extracted`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${processableUrls.length} files`,
        textLength: combinedText.length,
        status: 'completed'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-ocr function:', error);
    
    // Try to update status to failed
    try {
      const { resourceId } = await req.json();
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      await supabaseClient
        .from('resources')
        .update({
          ocr_status: 'failed',
          ocr_text: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ocr_processed_at: new Date().toISOString()
        })
        .eq('id', resourceId);
    } catch (updateError) {
      console.error('Failed to update resource status:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 'failed'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
