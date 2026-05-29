import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { resolveToFetchUrl } from '../_shared/mediaToken.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const PAGE_CONCURRENCY = 4;
const ROW_CONCURRENCY = 2;
// Stay well under the 150s edge-function idle limit.
const SOFT_DEADLINE_MS = 90_000;

const MANIFEST_RE =
  /(arc1:\/\/[A-Za-z0-9_\-=]+|https?:\/\/[^\s)"]+\/pages\/manifest\.json)/g;

function isManifestUrl(u: string): boolean {
  return (
    typeof u === 'string' &&
    (u.endsWith('/pages/manifest.json') ||
      (u.startsWith('arc1://') && u.length > 10))
  );
}

interface ManifestPage {
  n: number;
  url: string;
}
interface SplitManifest {
  kind?: string;
  totalPages?: number;
  pages?: ManifestPage[];
}

type PageHealth = 'ok' | 'broken' | 'unavailable';

async function fetchUrlWithRetry(
  rawUrl: string,
  maxRetries = 2,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; status: number }> {
  const resolved = resolveToFetchUrl(rawUrl);
  if (!resolved) return { ok: false, status: 0 };
  let lastStatus = 0;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20_000);
      const res = await fetch(resolved, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        const ab = await res.arrayBuffer();
        return { ok: true, bytes: new Uint8Array(ab) };
      }
      lastStatus = res.status;
      if (res.status !== 404 && res.status < 500) break;
    } catch {
      lastStatus = -1;
    }
    if (attempt < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  return { ok: false, status: lastStatus };
}

/**
 * Cheap PDF sanity check — catches the truncated/partial-upload class of
 * corruption we've observed. Not a full parse, but covers the failure mode
 * that produces "Invalid PDF structure" in pdfjs.
 */
function looksLikeValidPdf(bytes: Uint8Array): boolean {
  if (bytes.length < 100) return false;
  // Header check: %PDF- (allow up to 1024 bytes of leading junk like some
  // archive headers do).
  const headSlice = bytes.subarray(0, Math.min(bytes.length, 1024));
  const header = new TextDecoder('latin1').decode(headSlice);
  if (!header.includes('%PDF-')) return false;
  // Trailer check: %%EOF must be near the end.
  const tailLen = Math.min(bytes.length, 4096);
  const tail = new TextDecoder('latin1').decode(
    bytes.subarray(bytes.length - tailLen),
  );
  if (!tail.includes('%%EOF')) return false;
  // Must have at least one xref or startxref marker.
  if (!tail.includes('startxref') && !tail.includes('xref')) return false;
  return true;
}

async function checkPage(url: string): Promise<PageHealth> {
  const r = await fetchUrlWithRetry(url);
  if (!r.ok) {
    if (r.status === 404 || r.status === 0) return 'unavailable';
    return 'broken';
  }
  return looksLikeValidPdf(r.bytes) ? 'ok' : 'broken';
}

async function fetchManifest(url: string): Promise<SplitManifest> {
  const r = await fetchUrlWithRetry(url, 3);
  if (!r.ok) throw new Error(`Manifest fetch failed: ${r.status}`);
  const text = new TextDecoder().decode(r.bytes);
  const json = JSON.parse(text);
  if (json?.kind !== 'split-pdf' || !Array.isArray(json.pages)) {
    throw new Error('Not a split-PDF manifest');
  }
  return json as SplitManifest;
}

interface Row {
  kind: 'resource' | 'question';
  id: number;
  title: string;
  manifestUrl: string;
}

interface RowReport {
  kind: 'resource' | 'question';
  content_id: number;
  manifest_url: string;
  title: string;
  total_pages: number;
  broken_pages: number[];
  unavailable_pages: number[];
  manifest_error: string | null;
}

async function processRow(row: Row): Promise<RowReport> {
  const report: RowReport = {
    kind: row.kind,
    content_id: row.id,
    manifest_url: row.manifestUrl,
    title: row.title,
    total_pages: 0,
    broken_pages: [],
    unavailable_pages: [],
    manifest_error: null,
  };
  let manifest: SplitManifest;
  try {
    manifest = await fetchManifest(row.manifestUrl);
  } catch (e) {
    report.manifest_error =
      e instanceof Error ? e.message.slice(0, 240) : 'Manifest fetch failed';
    return report;
  }
  const pages = manifest.pages ?? [];
  report.total_pages = manifest.totalPages ?? pages.length;

  const queue = [...pages];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < PAGE_CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (queue.length) {
          const p = queue.shift();
          if (!p) return;
          const h = await checkPage(p.url);
          if (h === 'broken') report.broken_pages.push(p.n);
          else if (h === 'unavailable') report.unavailable_pages.push(p.n);
        }
      })(),
    );
  }
  await Promise.all(workers);
  report.broken_pages.sort((a, b) => a - b);
  report.unavailable_pages.sort((a, b) => a - b);
  return report;
}

async function collectRows(
  supabase: ReturnType<typeof createClient>,
  sinceResourceId: number,
  sinceQuestionId: number,
  limit: number,
): Promise<{ rows: Row[]; nextResourceId: number; nextQuestionId: number }> {
  const rows: Row[] = [];
  let nextResourceId = sinceResourceId;
  let nextQuestionId = sinceQuestionId;

  // Resources
  {
    const { data, error } = await supabase
      .from('resources')
      .select('id, title, data, deleted')
      .gt('id', sinceResourceId)
      .order('id', { ascending: true })
      .limit(limit);
    if (error) throw new Error(`resources: ${error.message}`);
    for (const r of (data ?? []) as any[]) {
      nextResourceId = r.id;
      if (r.deleted) continue;
      const arr: string[] = Array.isArray(r.data) ? r.data : [];
      const seen = new Set<string>();
      for (const u of arr) {
        if (typeof u === 'string' && isManifestUrl(u) && !seen.has(u)) {
          seen.add(u);
          rows.push({ kind: 'resource', id: r.id, title: r.title ?? '', manifestUrl: u });
        }
      }
    }
  }

  // Questions
  {
    const { data, error } = await supabase
      .from('questions')
      .select('id, data, deleted')
      .gt('id', sinceQuestionId)
      .ilike('data', '%pages/manifest%')
      .order('id', { ascending: true })
      .limit(limit);
    if (error) throw new Error(`questions: ${error.message}`);
    for (const q of (data ?? []) as any[]) {
      nextQuestionId = q.id;
      if (q.deleted) continue;
      const text: string = q.data ?? '';
      const matches = text.match(MANIFEST_RE) || [];
      const seen = new Set<string>();
      for (const u of matches) {
        if (isManifestUrl(u) && !seen.has(u)) {
          seen.add(u);
          rows.push({
            kind: 'question',
            id: q.id,
            title: text.slice(0, 120),
            manifestUrl: u,
          });
        }
      }
    }
  }

  return { rows, nextResourceId, nextQuestionId };
}

async function isAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return false;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: ok } = await admin.rpc('has_role', {
    _user_id: data.claims.sub,
    _role: 'admin',
  });
  return ok === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const authHeader = req.headers.get('Authorization');
  // Allow cron (service role) to skip the admin check.
  const isServiceRole =
    authHeader === `Bearer ${SERVICE_ROLE_KEY}` ||
    req.headers.get('apikey') === SERVICE_ROLE_KEY;

  if (!isServiceRole) {
    const allowed = await isAdmin(authHeader);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const sinceResourceId = Number(url.searchParams.get('since_resource') ?? 0) || 0;
  const sinceQuestionId = Number(url.searchParams.get('since_question') ?? 0) || 0;
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit') ?? 200), 1),
    1000,
  );

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const started = Date.now();
  const { rows, nextResourceId, nextQuestionId } = await collectRows(
    admin,
    sinceResourceId,
    sinceQuestionId,
    limit,
  );

  const reports: RowReport[] = [];
  let i = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < ROW_CONCURRENCY; w++) {
    workers.push(
      (async () => {
        while (i < rows.length) {
          if (Date.now() - started > SOFT_DEADLINE_MS) return;
          const row = rows[i++];
          try {
            const r = await processRow(row);
            reports.push(r);
          } catch (e) {
            console.error('row failed', row, e);
          }
        }
      })(),
    );
  }
  await Promise.all(workers);

  // Upsert all reports.
  if (reports.length > 0) {
    const { error } = await admin
      .from('pdf_health_reports')
      .upsert(
        reports.map((r) => ({
          ...r,
          checked_at: new Date().toISOString(),
        })),
        { onConflict: 'kind,content_id,manifest_url' },
      );
    if (error) {
      console.error('upsert failed', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }
  }

  const done = i >= rows.length;
  return new Response(
    JSON.stringify({
      processed_rows: reports.length,
      collected_rows: rows.length,
      next_resource_id: nextResourceId,
      next_question_id: nextQuestionId,
      done,
      duration_ms: Date.now() - started,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});