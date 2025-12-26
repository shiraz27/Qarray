const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry with exponential backoff for Archive.org files that need processing time
async function fetchWithRetry(url: string, maxRetries = 5, initialDelayMs = 2000): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      
      if (response.ok) {
        return response;
      }
      
      // If 404, Archive.org might still be processing - retry
      if (response.status === 404 && attempt < maxRetries - 1) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        console.log(`File not found (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // For network errors, also retry
      if (attempt < maxRetries - 1) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        console.log(`Fetch error (attempt ${attempt + 1}/${maxRetries}): ${lastError.message}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }
  
  throw lastError || new Error('Failed to fetch file after retries');
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    
    console.log('Fetching media from:', url);
    
    // Fetch file with retry logic for Archive.org processing delay
    const response = await fetchWithRetry(url);
    
    const blob = await response.blob();
    
    console.log('Successfully fetched file, size:', blob.size);
    
    // Stream back to client
    return new Response(blob, {
      headers: {
        ...corsHeaders,
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      },
    });
  } catch (error) {
    console.error('Fetch media error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
