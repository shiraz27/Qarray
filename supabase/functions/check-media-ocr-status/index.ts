import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    console.log('Checking for media pending OCR processing...');

    // Find all resources with media that need OCR processing
    const { data: resources, error } = await supabaseClient
      .from('resources')
      .select('id, data')
      .eq('ocr_status', 'pending')
      .eq('deleted', false)
      .limit(10);

    if (error) {
      throw error;
    }

    if (!resources || resources.length === 0) {
      console.log('No pending OCR jobs found');
      return new Response(
        JSON.stringify({ message: 'No pending OCR jobs', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${resources.length} resources pending OCR`);

    let processedCount = 0;

    // Process each resource
    for (const resource of resources) {
      // Check if resource has PDFs or images
      const mediaUrls = resource.data?.filter((url: string) => {
        const lowerUrl = url.toLowerCase();
        return lowerUrl.endsWith('.pdf') || 
               /\.(jpg|jpeg|png|gif|webp)$/i.test(lowerUrl);
      });

      if (!mediaUrls || mediaUrls.length === 0) {
        // Mark as not_applicable if no processable media
        await supabaseClient
          .from('resources')
          .update({ ocr_status: 'not_applicable' })
          .eq('id', resource.id);
        continue;
      }

      // Trigger OCR processing for the first media file
      const mediaUrl = mediaUrls[0];
      
      console.log(`Triggering OCR for resource ${resource.id}`);

      // Call the OCR processing function
      const { error: invokeError } = await supabaseClient.functions.invoke(
        'process-media-ocr',
        {
          body: { resourceId: resource.id, mediaUrl },
        }
      );

      if (invokeError) {
        console.error(`Failed to invoke OCR for resource ${resource.id}:`, invokeError);
        await supabaseClient
          .from('resources')
          .update({ ocr_status: 'failed' })
          .eq('id', resource.id);
      } else {
        processedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        message: 'OCR check completed',
        processed: processedCount,
        total: resources.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in check-media-ocr-status:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
