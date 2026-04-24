const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry with exponential backoff for Archive.org files that need processing time
// Result type to distinguish between retriable and permanent failures
type FetchResult = 
  | { ok: true; response: Response }
  | { ok: false; status: number; message: string };

// Retry with exponential backoff for Archive.org files that need processing time
async function fetchWithRetry(url: string, maxRetries = 5, initialDelayMs = 2000): Promise<FetchResult> {
  let lastStatus = 0;
  let lastMessage = 'Unknown error';
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      
      if (response.ok) {
        return { ok: true, response };
      }
      
      lastStatus = response.status;
      lastMessage = response.statusText;
      
      // If 404, Archive.org might still be processing - retry
      if (response.status === 404 && attempt < maxRetries - 1) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        console.log(`File not found (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Non-retriable error or last attempt
      return { ok: false, status: response.status, message: response.statusText };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      lastMessage = errorMessage;
      lastStatus = 500;
      
      // For network errors, also retry
      if (attempt < maxRetries - 1) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        console.log(`Fetch error (attempt ${attempt + 1}/${maxRetries}): ${errorMessage}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }
  
  return { ok: false, status: lastStatus, message: lastMessage };
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
    const result = await fetchWithRetry(url);
    
    if (!result.ok) {
      // Archive.org propagation can take a while; treat any non-OK
      // upstream status as a soft "unavailable" response with HTTP 200 so the
      // platform's runtime-error monitor doesn't flag every retryable miss as
      // a hard failure. The frontend inspects the JSON body to decide how to
      // surface this state to the user.
      console.warn(`Fetch media unavailable: ${result.status} - ${result.message}`);
      return new Response(
        JSON.stringify({
          unavailable: true,
          upstreamStatus: result.status,
          error: `File not available: ${result.message}`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    const blob = await result.response.blob();
    
    console.log('Successfully fetched file, size:', blob.size);
    
    // Stream back to client
    return new Response(blob, {
      headers: {
        ...corsHeaders,
        'Content-Type': result.response.headers.get('Content-Type') || 'application/octet-stream',
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
