import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  // We'll keep a copy of resourceId so we can update status in case of errors
  let parsedBody: ProcessOCRRequest | null = null;

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    parsedBody = await req.json() as ProcessOCRRequest;
    const { resourceId, mediaUrls } = parsedBody;

    console.log(`Starting OCR processing for resource ${resourceId}`);
    console.log(`Media URLs:`, mediaUrls);

    // Filter for processable files (PDF and images)
    const processableUrls = mediaUrls.filter((url: string) => {
      const lowerUrl = url.toLowerCase();
      return lowerUrl.match(/\.(pdf|jpg|jpeg|png|gif|webp)$/);
    });

    // Check for non-processable media (videos, audio)
    const nonProcessableUrls = mediaUrls.filter((url: string) => {
      const lowerUrl = url.toLowerCase();
      return lowerUrl.match(/\.(webm|mp4|mov|avi|mp3|wav|ogg|m4a)$/);
    });

    if (nonProcessableUrls.length > 0 && processableUrls.length === 0) {
      console.log(`Resource ${resourceId} contains only non-processable files (video/audio):`, nonProcessableUrls);
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
          message: 'Resource contains only video/audio files - marked as not applicable',
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

    // NOTE: The Deno edge runtime doesn't support the Web Worker API
    // required by tesseract.js, so we cannot run full OCR here.
    // Instead, we fetch the files server-side (no CORS issues) and
    // store a placeholder message so resources don't get stuck.

    const fileSummaries: string[] = [];

    for (const url of processableUrls) {
      try {
        const fileName = url.split('/').pop() || 'unknown';
        console.log(`Fetching ${fileName} for placeholder OCR...`);

        const response = await fetch(url);
        if (!response.ok) {
          console.error(`Failed to fetch ${fileName}: ${response.status}`);
          fileSummaries.push(`--- Error fetching ${fileName} ---\n[HTTP ${response.status}]`);
          continue;
        }

        const contentLength = response.headers.get('content-length') ?? 'unknown';
        const contentType = response.headers.get('content-type') ?? 'unknown';

        fileSummaries.push(
          `--- ${fileName} ---\n[Fetched successfully: type=${contentType}, size=${contentLength} bytes]\n` +
          '[Full OCR is not available in the current backend environment]'
        );
      } catch (error) {
        console.error('Error while fetching file for placeholder OCR:', error);
        const fileName = url.split('/').pop() || 'unknown';
        fileSummaries.push(
          `--- Error processing ${fileName} ---\n${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    const combinedText = fileSummaries.join('\n\n');

    await supabaseClient
      .from('resources')
      .update({
        ocr_text: combinedText || 'No text extracted (OCR engine unavailable on server)',
        ocr_status: 'completed',
        ocr_processed_at: new Date().toISOString()
      })
      .eq('id', resourceId);

    console.log(`Pseudo-OCR completed for resource ${resourceId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${processableUrls.length} files (placeholder OCR)` ,
        textLength: combinedText.length,
        status: 'completed'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-ocr function:', error);

    // Try to update status to failed if we know the resourceId
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      if (parsedBody?.resourceId) {
        await supabaseClient
          .from('resources')
          .update({
            ocr_status: 'failed',
            ocr_text: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            ocr_processed_at: new Date().toISOString()
          })
          .eq('id', parsedBody.resourceId);
      }
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
