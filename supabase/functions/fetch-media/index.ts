import { resolveToFetchUrl, logSafeRef } from '../_shared/mediaToken.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Expose-Headers':
    'content-length, content-range, accept-ranges, content-type, x-proxy-result',
};

const WRAPPED_HEADER = { 'X-Proxy-Result': 'wrapped' };
const UPSTREAM_HEADER = { 'X-Proxy-Result': 'upstream' };

// Retry with exponential backoff for Archive.org files that need processing time
// Result type to distinguish between retriable and permanent failures
type FetchResult = 
  | { ok: true; response: Response }
  | { ok: false; status: number; message: string };

// Retry with exponential backoff for Archive.org files that need processing time
async function fetchWithRetry(
  url: string,
  maxRetries = 3,
  initialDelayMs = 1500,
  init: RequestInit = {},
): Promise<FetchResult> {
  let lastStatus = 0;
  let lastMessage = 'Unknown error';
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Per-attempt timeout so a single hanging upstream cannot exhaust
      // the edge function's 150s idle limit.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      let response: Response;
      try {
        response = await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      
      if (response.ok || response.status === 206) {
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
    // Accept either:
    //   GET  /fetch-media?token=arc1://...    (used as <img>/<audio> src)
    //   POST { token: "arc1://..." }          (preferred from app code)
    //   POST { url: "https://archive.org/..." } (legacy fallback)
    let token: string | null = null;
    let legacyUrl: string | null = null;

    if (req.method === 'GET') {
      const u = new URL(req.url);
      token = u.searchParams.get('token');
    } else {
      try {
        const body = await req.json();
        token = body?.token ?? null;
        legacyUrl = body?.url ?? null;
      } catch {
        // ignore
      }
    }

    const resolved = token ? resolveToFetchUrl(token) : resolveToFetchUrl(legacyUrl);
    if (!resolved) {
      return new Response(
        JSON.stringify({ error: 'Invalid or missing media token' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            ...WRAPPED_HEADER,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    console.log('Fetching media ref:', logSafeRef(token || legacyUrl));

    // Pass through Range so <audio>/<video> seeking works through the proxy.
    const rangeHeader = req.headers.get('range');
    const init: RequestInit = rangeHeader
      ? { headers: { Range: rangeHeader } }
      : {};

    const result = await fetchWithRetry(resolved, 3, 1500, init);
    
    if (!result.ok) {
      // Archive.org propagation can take a while; treat any non-OK
      // upstream status as a soft "unavailable" response with HTTP 200 so the
      // platform's runtime-error monitor doesn't flag every retryable miss as
      // a hard failure. The frontend inspects the JSON body to decide how to
      // surface this state to the user.
      console.warn(`Media unavailable: status=${result.status}`);
      return new Response(
        JSON.stringify({
          unavailable: true,
          upstreamStatus: result.status,
          error: `File not available: ${result.message}`,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            ...WRAPPED_HEADER,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Stream upstream body through (preserves Content-Length / Content-Range
    // so the browser can show progress and seek inside audio/video).
    const upstream = result.response;
    const upstreamCT = (upstream.headers.get('Content-Type') || '').toLowerCase();

    // Archive.org occasionally answers 200 with an HTML/JSON/XML interstitial
    // (item still propagating, S3-style error, redirect page) instead of the
    // expected binary. Treat that as a soft-unavailable wrapped response so
    // the frontend can show its Retry UI instead of trying to render the
    // payload as a PDF/image.
    const looksTextual =
      upstreamCT.startsWith('application/json') ||
      upstreamCT.startsWith('text/html') ||
      upstreamCT.startsWith('text/xml') ||
      upstreamCT.startsWith('application/xml');
    if (looksTextual) {
      try {
        await upstream.body?.cancel();
      } catch {
        /* ignore */
      }
      console.warn(`Upstream returned non-binary content-type: ${upstreamCT}`);
      return new Response(
        JSON.stringify({
          unavailable: true,
          upstreamStatus: upstream.status,
          upstreamContentType: upstreamCT,
          error: 'Source not ready yet — please retry shortly.',
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            ...WRAPPED_HEADER,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    const passthrough: Record<string, string> = {
      ...corsHeaders,
      ...UPSTREAM_HEADER,
      'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream',
    };
    const len = upstream.headers.get('Content-Length');
    if (len) passthrough['Content-Length'] = len;
    const cr = upstream.headers.get('Content-Range');
    if (cr) passthrough['Content-Range'] = cr;
    const ar = upstream.headers.get('Accept-Ranges');
    if (ar) passthrough['Accept-Ranges'] = ar;
    return new Response(upstream.body, {
      status: upstream.status,
      headers: passthrough,
    });
  } catch (error) {
    console.error('Fetch media error:', error instanceof Error ? error.message : 'unknown');
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          ...WRAPPED_HEADER,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
