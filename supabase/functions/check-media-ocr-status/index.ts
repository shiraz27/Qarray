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

    console.log('Checking OCR status...');

    // Get resources OCR statistics
    const { data: resources, error } = await supabaseClient
      .from('resources')
      .select('id, ocr_status')
      .eq('deleted', false);

    if (error) {
      throw error;
    }

    const stats = {
      pending: resources?.filter(r => r.ocr_status === 'pending').length || 0,
      processing: resources?.filter(r => r.ocr_status === 'processing').length || 0,
      completed: resources?.filter(r => r.ocr_status === 'completed').length || 0,
      failed: resources?.filter(r => r.ocr_status === 'failed').length || 0,
      not_applicable: resources?.filter(r => r.ocr_status === 'not_applicable').length || 0,
    };

    console.log('OCR statistics:', stats);

    return new Response(
      JSON.stringify({
        message: 'OCR status retrieved',
        stats,
        note: 'OCR is now processed client-side during upload'
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
