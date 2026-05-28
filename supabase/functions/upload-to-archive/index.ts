import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { encodeMediaUrl } from '../_shared/mediaToken.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ITEM = 'qarray-educational-content';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000;
const PRESIGN_EXPIRY_SECONDS = 60 * 60; // 1 hour

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sanitize = (s: string) => s.replace(/[^a-z0-9]/gi, '-').toLowerCase();
const encodeForHeader = (s: string) => encodeURIComponent(s).replace(/%20/g, ' ');

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function authHeader() {
  const accessKey = Deno.env.get('ARCHIVE_ORG_ACCESS_KEY');
  const secretKey = Deno.env.get('ARCHIVE_ORG_SECRET_KEY');
  if (!accessKey || !secretKey) throw new Error('Archive.org credentials not configured');
  return `LOW ${accessKey}:${secretKey}`;
}

function archiveCreds() {
  const accessKey = Deno.env.get('ARCHIVE_ORG_ACCESS_KEY');
  const secretKey = Deno.env.get('ARCHIVE_ORG_SECRET_KEY');
  if (!accessKey || !secretKey) throw new Error('Archive.org credentials not configured');
  return { accessKey, secretKey };
}

// AWS S3 v2 query-string auth (HMAC-SHA1).
// stringToSign = METHOD\n\n\nEXPIRES\n/<bucket>/<key>?<sub-resources>
// Only specific sub-resources are part of the canonical resource. For multipart
// uploads we need `uploadId` and `partNumber`.
async function signS3V2QueryUrl(opts: {
  method: 'PUT' | 'GET' | 'DELETE' | 'POST';
  key: string; // path inside bucket (no leading slash)
  subResources?: Record<string, string>;
  expiresInSeconds?: number;
}): Promise<string> {
  const { accessKey, secretKey } = archiveCreds();
  const expires = Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? PRESIGN_EXPIRY_SECONDS);

  // Build sub-resource string in canonical (alphabetical) order
  const subEntries = Object.entries(opts.subResources ?? {}).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const subString = subEntries.length
    ? '?' + subEntries.map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join('&')
    : '';

  const canonicalResource = `/${ITEM}/${opts.key}${subString}`;
  const stringToSign = `${opts.method}\n\n\n${expires}\n${canonicalResource}`;

  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(stringToSign));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  // Encode the path segments for the URL but keep slashes
  const encodedKey = opts.key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

  const queryParams = new URLSearchParams();
  for (const [k, v] of subEntries) {
    queryParams.set(k, v);
  }
  queryParams.set('AWSAccessKeyId', accessKey);
  queryParams.set('Expires', String(expires));
  queryParams.set('Signature', signature);

  return `https://s3.us.archive.org/${ITEM}/${encodedKey}?${queryParams.toString()}`;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const wait = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        console.log(`Retry ${attempt}, waiting ${wait}ms`);
        await delay(wait);
      }
      const res = await fetch(url, init);
      if (res.status === 503 && attempt < retries) {
        console.warn(`503 SlowDown (attempt ${attempt + 1})`);
        continue;
      }
      if (res.status >= 500 && attempt < retries) {
        console.warn(`Server error ${res.status} (attempt ${attempt + 1})`);
        continue;
      }
      return res;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.error(`Attempt ${attempt + 1} failed:`, lastError.message);
      if (attempt >= retries) throw lastError;
    }
  }
  throw lastError || new Error('Request failed after retries');
}

interface PathContext {
  folderPath: string;
  metadataHeaders: Record<string, string>;
}

async function buildPathAndMetadata(opts: {
  fileName: string;
  fileType: string;
  chapterId?: string | null;
  contentType?: string | null;
  contentId?: string | null;
  subPath?: string | null;
}): Promise<PathContext> {
  const { fileName, fileType, chapterId, contentType, contentId, subPath } = opts;
  const mediatype =
    fileType === 'audio' ? 'audio' : fileType === 'image' ? 'image' : 'texts';

  const baseHeaders: Record<string, string> = {
    'x-archive-meta-mediatype': mediatype,
    'x-archive-meta-collection': 'opensource',
  };

  if (chapterId) {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('id, name, subject_id, class_id')
      .eq('id', parseInt(chapterId))
      .single();
    if (chapterError || !chapter) throw new Error('Chapter not found');

    const { data: subject, error: subjectError } = await supabase
      .from('subjects')
      .select('id, name')
      .eq('id', chapter.subject_id)
      .single();
    if (subjectError || !subject) throw new Error('Subject not found');

    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('id, name')
      .eq('id', chapter.class_id)
      .single();
    if (classError || !classData) throw new Error('Class not found');

    const className = sanitize(classData.name);
    const subjectName = sanitize(subject.name);
    const chapterName = sanitize(chapter.name);

    // When subPath is provided it replaces the leaf filename and lets callers
    // place files under a deeper folder (e.g. <originalBase>/pages/1.pdf).
    const leaf = subPath || fileName;
    const folderPath =
      contentType && contentId
        ? `${className}/${subjectName}/${chapterName}/${contentType}/${contentId}/${leaf}`
        : `${className}/${subjectName}/${chapterName}/${leaf}`;

    return {
      folderPath,
      metadataHeaders: {
        ...baseHeaders,
        'x-archive-meta-title': encodeForHeader(
          `${classData.name} - ${subject.name} - ${chapter.name}`,
        ),
        'x-archive-meta-class': encodeForHeader(classData.name),
        'x-archive-meta-subject': encodeForHeader(subject.name),
        'x-archive-meta-chapter': encodeForHeader(chapter.name),
        ...(contentType ? { 'x-archive-meta-content-type': encodeForHeader(contentType) } : {}),
        ...(contentId ? { 'x-archive-meta-content-id': encodeForHeader(contentId) } : {}),
      },
    };
  }

  const timestamp = Date.now();
  // Without a chapter we still honor subPath so per-page splits group together.
  const fallbackLeaf = subPath || sanitize(fileName);
  return {
    folderPath: `uploads/${timestamp}-${fallbackLeaf}`,
    metadataHeaders: {
      ...baseHeaders,
      'x-archive-meta-title': encodeForHeader(`Upload - ${fileName}`),
    },
  };
}

function archiveDownloadUrl(folderPath: string) {
  return `https://archive.org/download/${ITEM}/${folderPath}`;
}

/** Public-facing URL returned to clients — always an opaque token. */
function publicMediaUrl(folderPath: string) {
  return encodeMediaUrl(archiveDownloadUrl(folderPath));
}

function archiveS3Url(folderPath: string) {
  return `https://s3.us.archive.org/${ITEM}/${folderPath}`;
}

// ---------- Single-shot upload (legacy + small files) ----------
async function handleSingle(req: Request): Promise<Response> {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const fileName = formData.get('fileName') as string;
  const fileType = formData.get('fileType') as string;
  const chapterId = formData.get('chapterId') as string | null;
  const contentType = formData.get('contentType') as string | null;
  const contentId = formData.get('contentId') as string | null;
  const subPath = formData.get('subPath') as string | null;

  if (!file || !fileName) throw new Error('File and fileName are required');

  const { folderPath, metadataHeaders } = await buildPathAndMetadata({
    fileName,
    fileType,
    chapterId,
    contentType,
    contentId,
    subPath,
  });

  const buffer = await file.arrayBuffer();
  const res = await fetchWithRetry(archiveS3Url(folderPath), {
    method: 'PUT',
    headers: {
      Authorization: authHeader(),
      'x-amz-auto-make-bucket': '1',
      ...metadataHeaders,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: new Blob([buffer]),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Single upload failed:', errorText);
    const status = res.status === 503 ? 429 : 500;
    return jsonResponse(
      { error: `Upload failed: ${res.status} - ${errorText}`, retryable: res.status >= 500 },
      status,
    );
  }

  return jsonResponse({ url: publicMediaUrl(folderPath), fileName });
}

// ---------- Overwrite an existing Archive.org key ----------
// Used by the watermark backfill to replace the original file in place.
// The folder/key is known (decoded from the stored media token), so we skip
// the chapter/subject/class lookup entirely and PUT directly to the bucket.
async function handleOverwrite(req: Request): Promise<Response> {
  const formData = await req.formData();
  const key = formData.get('key') as string;
  const file = formData.get('file') as File;
  const mediatype = (formData.get('mediatype') as string | null) || 'texts';

  if (!key || !file) throw new Error('key and file are required');

  // Defensive guard: archive paths must stay inside our bucket folder root.
  if (key.startsWith('/') || key.includes('..')) {
    return jsonResponse({ error: 'invalid key' }, 400);
  }

  const buffer = await file.arrayBuffer();
  const res = await fetchWithRetry(archiveS3Url(key), {
    method: 'PUT',
    headers: {
      Authorization: authHeader(),
      'x-amz-auto-make-bucket': '1',
      'x-archive-meta-mediatype': mediatype,
      'x-archive-meta-collection': 'opensource',
      'x-archive-keep-old-version': '0',
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: new Blob([buffer]),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Overwrite failed:', errorText);
    const status = res.status === 503 ? 429 : 500;
    return jsonResponse(
      { error: `Overwrite failed: ${res.status} - ${errorText}`, retryable: res.status >= 500 },
      status,
    );
  }

  return jsonResponse({ url: publicMediaUrl(key), key });
}

// ---------- Multipart: initiate ----------
async function handleInitiate(req: Request): Promise<Response> {
  const body = await req.json();
  const { fileName, fileType, chapterId, contentType, contentId, mimeType, subPath } = body;
  if (!fileName) throw new Error('fileName is required');

  const { folderPath, metadataHeaders } = await buildPathAndMetadata({
    fileName,
    fileType,
    chapterId,
    contentType,
    contentId,
    subPath,
  });

  const url = `${archiveS3Url(folderPath)}?uploads`;
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'x-amz-auto-make-bucket': '1',
      ...metadataHeaders,
      'Content-Type': mimeType || 'application/octet-stream',
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Initiate failed:', errorText);
    return jsonResponse(
      { error: `Initiate failed: ${res.status} - ${errorText}`, retryable: res.status >= 500 },
      res.status === 503 ? 429 : 500,
    );
  }

  const xml = await res.text();
  const uploadIdMatch = xml.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!uploadIdMatch) {
    console.error('No UploadId in response:', xml);
    return jsonResponse({ error: 'Invalid initiate response' }, 500);
  }

  return jsonResponse({
    uploadId: uploadIdMatch[1],
    key: folderPath,
    finalUrl: publicMediaUrl(folderPath),
  });
}

// ---------- Multipart: upload-part ----------
async function handleUploadPart(req: Request): Promise<Response> {
  const formData = await req.formData();
  const key = formData.get('key') as string;
  const uploadId = formData.get('uploadId') as string;
  const partNumber = parseInt(formData.get('partNumber') as string);
  const chunk = formData.get('chunk') as File;

  if (!key || !uploadId || !partNumber || !chunk) {
    throw new Error('key, uploadId, partNumber and chunk are required');
  }

  const buffer = await chunk.arrayBuffer();
  const url = `${archiveS3Url(key)}?partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`;

  const res = await fetchWithRetry(url, {
    method: 'PUT',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/octet-stream',
    },
    body: new Blob([buffer]),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`Part ${partNumber} failed:`, errorText);
    return jsonResponse(
      { error: `Part upload failed: ${res.status} - ${errorText}`, retryable: res.status >= 500 },
      res.status === 503 ? 429 : 500,
    );
  }

  const etag = res.headers.get('ETag') || res.headers.get('etag') || '';
  if (!etag) {
    return jsonResponse({ error: 'Missing ETag in part response' }, 500);
  }

  return jsonResponse({ partNumber, etag });
}

// ---------- Multipart: sign-part (presigned URL for direct browser PUT) ----------
async function handleSignPart(req: Request): Promise<Response> {
  const body = await req.json();
  const { key, uploadId, partNumber } = body as {
    key: string;
    uploadId: string;
    partNumber: number;
  };
  if (!key || !uploadId || !partNumber) {
    throw new Error('key, uploadId and partNumber are required');
  }

  const url = await signS3V2QueryUrl({
    method: 'PUT',
    key,
    subResources: {
      partNumber: String(partNumber),
      uploadId,
    },
  });

  return jsonResponse({
    url,
    method: 'PUT',
    expiresAt: Math.floor(Date.now() / 1000) + PRESIGN_EXPIRY_SECONDS,
  });
}

// ---------- Multipart: complete ----------
async function handleComplete(req: Request): Promise<Response> {
  const body = await req.json();
  const { key, uploadId, parts } = body as {
    key: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  };
  if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
    throw new Error('key, uploadId and parts are required');
  }

  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  const xmlBody =
    `<CompleteMultipartUpload>` +
    sorted
      .map(
        (p) =>
          `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`,
      )
      .join('') +
    `</CompleteMultipartUpload>`;

  const url = `${archiveS3Url(key)}?uploadId=${encodeURIComponent(uploadId)}`;
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/xml',
    },
    body: xmlBody,
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Complete failed:', errorText);
    return jsonResponse(
      { error: `Complete failed: ${res.status} - ${errorText}`, retryable: res.status >= 500 },
      res.status === 503 ? 429 : 500,
    );
  }

  // Drain body
  await res.text();
  return jsonResponse({ url: publicMediaUrl(key) });
}

// ---------- Multipart: abort ----------
async function handleAbort(req: Request): Promise<Response> {
  const body = await req.json();
  const { key, uploadId } = body as { key: string; uploadId: string };
  if (!key || !uploadId) throw new Error('key and uploadId are required');

  const url = `${archiveS3Url(key)}?uploadId=${encodeURIComponent(uploadId)}`;
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: authHeader() },
    });
    if (!res.ok) {
      const t = await res.text();
      console.warn('Abort response not ok:', res.status, t);
    }
  } catch (e) {
    console.warn('Abort error (best-effort):', e);
  }
  return jsonResponse({ aborted: true });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('upload-to-archive invoked');
    const url = new URL(req.url);
    const ct = req.headers.get('content-type') || '';

    let action: string | null = url.searchParams.get('action');

    if (!action) {
      if (ct.includes('multipart/form-data')) {
        // Inspect formData for "action" field; fall back to "single"
        const cloned = req.clone();
        const fd = await cloned.formData();
        action = (fd.get('action') as string | null) || 'single';
        // We've consumed the cloned body; pass the original to handlers
      } else if (ct.includes('application/json')) {
        const cloned = req.clone();
        try {
          const j = await cloned.json();
          action = (j && j.action) || null;
        } catch {
          action = null;
        }
      }
    }

    action = action || 'single';
    console.log('action:', action);

    switch (action) {
      case 'single':
        return await handleSingle(req);
      case 'overwrite':
        return await handleOverwrite(req);
      case 'initiate':
        return await handleInitiate(req);
      case 'upload-part':
        return await handleUploadPart(req);
      case 'sign-part':
        return await handleSignPart(req);
      case 'complete':
        return await handleComplete(req);
      case 'abort':
        return await handleAbort(req);
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    console.error('upload-to-archive error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const retryable = msg.includes('503') || msg.includes('Rate limited');
    return jsonResponse({ error: msg, retryable }, retryable ? 429 : 500);
  }
});
