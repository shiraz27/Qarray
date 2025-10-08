import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Upload to Archive.org initiated');
    
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const fileName = formData.get('fileName') as string;
    const fileType = formData.get('fileType') as string;
    
    if (!file || !fileName) {
      throw new Error('File and fileName are required');
    }

    const accessKey = Deno.env.get('ARCHIVE_ORG_ACCESS_KEY');
    const secretKey = Deno.env.get('ARCHIVE_ORG_SECRET_KEY');

    if (!accessKey || !secretKey) {
      throw new Error('Archive.org credentials not configured');
    }

    console.log(`Uploading file: ${fileName}, type: ${fileType}`);

    // Generate a unique identifier for the item
    const timestamp = Date.now();
    const itemIdentifier = `qarray-${timestamp}-${fileName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;

    // Read file as array buffer
    const fileBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    // Upload to Archive.org using S3-compatible API
    const uploadUrl = `https://s3.us.archive.org/${itemIdentifier}/${fileName}`;
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `LOW ${accessKey}:${secretKey}`,
        'x-amz-auto-make-bucket': '1',
        'x-archive-meta-mediatype': fileType === 'audio' ? 'audio' : fileType === 'image' ? 'image' : 'texts',
        'x-archive-meta-collection': 'opensource',
        'x-archive-meta-title': fileName,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: fileBytes,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Archive.org upload failed:', errorText);
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const archiveUrl = `https://archive.org/download/${itemIdentifier}/${fileName}`;
    console.log('Upload successful:', archiveUrl);

    return new Response(
      JSON.stringify({ 
        url: archiveUrl,
        itemIdentifier,
        fileName 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error uploading to Archive.org:', error);
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
