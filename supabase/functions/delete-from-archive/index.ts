import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { resolveToFetchUrl, logSafeRef } from '../_shared/mediaToken.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    // Accept `token` (preferred), or legacy `fileUrl` containing a raw URL.
    const ref: string | null = body?.token ?? body?.fileUrl ?? null;
    if (!ref) {
      throw new Error('Media reference is required');
    }

    const fileUrl = resolveToFetchUrl(ref);
    if (!fileUrl) {
      throw new Error('Invalid media reference');
    }

    console.log('Delete initiated for ref:', logSafeRef(ref));

    const accessKey = Deno.env.get('ARCHIVE_ORG_ACCESS_KEY');
    const secretKey = Deno.env.get('ARCHIVE_ORG_SECRET_KEY');

    if (!accessKey || !secretKey) {
      throw new Error('Archive.org credentials not configured');
    }

    // Extract the path from the URL
    // URL format: https://archive.org/download/qarray-educational-content/path/to/file.ext
    const urlParts = fileUrl.replace('https://archive.org/download/', '').split('/');
    const itemIdentifier = urlParts[0];
    const filePath = urlParts.slice(1).join('/');

    // Delete from Archive.org using S3-compatible API
    const deleteUrl = `https://s3.us.archive.org/${itemIdentifier}/${filePath}`;
    
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `LOW ${accessKey}:${secretKey}`,
      },
    });

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      console.error('Archive.org deletion failed:', errorText);
      // Don't throw error if file doesn't exist (404)
      if (deleteResponse.status !== 404) {
        throw new Error(`Deletion failed: ${deleteResponse.status} - ${errorText}`);
      }
    }

    console.log('File deleted successfully:', logSafeRef(ref));

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'File deleted successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error deleting from Archive.org:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
