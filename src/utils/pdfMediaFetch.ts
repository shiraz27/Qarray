import { supabase } from '@/integrations/supabase/client';
import { encodeMediaUrl } from '@/utils/mediaToken';

export type PdfFetchResult =
  | { kind: 'ok'; blob: Blob }
  | { kind: 'unavailable'; message?: string }
  | { kind: 'error'; message: string };

/**
 * Fetch a PDF (or any binary) through the fetch-media edge function using a
 * direct fetch() call. We avoid supabase.functions.invoke() because it can
 * mishandle large/binary responses, returning unexpected shapes that broke
 * the PDF preview ("Unexpected response from media proxy").
 */
export async function fetchPdfViaProxy(url: string): Promise<PdfFetchResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  let session: any = null;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    /* not signed in is fine */
  }

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/fetch-media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${session?.access_token || supabaseKey}`,
      },
      body: JSON.stringify({ token: encodeMediaUrl(url) }),
    });
  } catch (e) {
    return {
      kind: 'error',
      message: e instanceof Error ? e.message : 'Network error',
    };
  }

  const contentType = res.headers.get('Content-Type') || '';
  const proxyResult = (res.headers.get('X-Proxy-Result') || '').toLowerCase();

  // The proxy uses HTTP 200 + JSON `{ unavailable: true }` for retryable
  // upstream misses (Archive.org propagation). Only treat a JSON body as the
  // wrapper envelope when the proxy explicitly tagged it as `wrapped` —
  // otherwise it's upstream content (e.g. an Archive.org HTML/JSON
  // interstitial) we should surface as "still processing" instead of
  // misreporting as a hard proxy error.
  if (proxyResult === 'wrapped' && contentType.includes('application/json')) {
    try {
      const payload = await res.json();
      if (payload?.unavailable) {
        return { kind: 'unavailable', message: payload.error };
      }
      return {
        kind: 'error',
        message: payload?.error || "Couldn't load file. Please try again.",
      };
    } catch {
      return { kind: 'error', message: 'Proxy returned invalid JSON' };
    }
  }

  // Defensive: an older proxy deployment, or an upstream that slipped through
  // with a textual content-type, would otherwise be treated as the PDF blob
  // and crash pdfjs. Surface as soft-unavailable so the Retry UI shows.
  if (
    proxyResult !== 'upstream' &&
    (contentType.includes('application/json') ||
      contentType.startsWith('text/html') ||
      contentType.startsWith('text/xml') ||
      contentType.startsWith('application/xml'))
  ) {
    return {
      kind: 'unavailable',
      message: 'Source not ready yet — please retry shortly.',
    };
  }

  if (!res.ok) {
    return { kind: 'error', message: `Proxy error (${res.status})` };
  }

  const raw = await res.blob();
  // Force PDF mime if upstream sent octet-stream / unknown
  const blob =
    raw.type === 'application/pdf'
      ? raw
      : new Blob([raw], { type: 'application/pdf' });
  return { kind: 'ok', blob };
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}