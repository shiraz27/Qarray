import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { resolveToFetchUrl, encodeMediaUrl, isMediaToken } from '../_shared/mediaToken.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ITEM = 'qarray-educational-content';
const ARCHIVE_DL_PREFIX = `https://archive.org/download/${ITEM}/`;
const ITEM_S3 = `https://s3.us.archive.org/${ITEM}`;
const MAX_FILE_BYTES = 200 * 1024 * 1024;

function json(body: unknown, status = 200) {
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

function archiveKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const raw = isMediaToken(url) ? resolveToFetchUrl(url) : url;
  if (!raw || !raw.startsWith(ARCHIVE_DL_PREFIX)) return null;
  return raw.slice(ARCHIVE_DL_PREFIX.length);
}

interface HistoryVersion {
  n: number;
  size?: number;
  mtime?: number;
}

let cachedMeta: { at: number; files: any[] } | null = null;
const META_TTL_MS = 30_000;

async function fetchItemFiles(): Promise<any[]> {
  if (cachedMeta && Date.now() - cachedMeta.at < META_TTL_MS) return cachedMeta.files;
  const res = await fetch(`https://archive.org/metadata/${ITEM}`);
  if (!res.ok) throw new Error(`metadata fetch ${res.status}`);
  const j = await res.json();
  const files = Array.isArray(j?.files) ? j.files : [];
  cachedMeta = { at: Date.now(), files };
  return files;
}

/** List `history/files/<key>.~N~` entries for one key. */
function findHistoryVersions(files: any[], key: string): HistoryVersion[] {
  const prefix = `history/files/${key}.~`;
  const out: HistoryVersion[] = [];
  for (const f of files) {
    const name: string = f?.name || '';
    if (!name.startsWith(prefix)) continue;
    const m = name.match(/\.~(\d+)~$/);
    if (!m) continue;
    out.push({
      n: parseInt(m[1], 10),
      size: f?.size ? Number(f.size) : undefined,
      mtime: f?.mtime ? Number(f.mtime) : undefined,
    });
  }
  out.sort((a, b) => a.n - b.n);
  return out;
}

function pickVersion(versions: HistoryVersion[], v: 'earliest' | 'previous' | number): HistoryVersion | null {
  if (versions.length === 0) return null;
  if (typeof v === 'number') return versions.find((x) => x.n === v) || null;
  if (v === 'previous') return versions[versions.length - 1];
  return versions[0]; // earliest
}

/** Extract media URLs (tokens or raw archive URLs) from a row's data field. */
function extractUrlsFromRowData(data: any): string[] {
  if (!data) return [];
  const text = Array.isArray(data) ? data.join('\n') : String(data);
  // Match both opaque tokens and raw archive URLs.
  const tokens = text.match(/arc1:\/\/[A-Za-z0-9_-]+/g) || [];
  const raws = text.match(/https:\/\/archive\.org\/download\/[^\s"'<>)\]]+/g) || [];
  const all = Array.from(new Set([...tokens, ...raws]));
  return all;
}

/** Manifest URLs end in `.json` keys that contain `/pages/manifest`. We expand them. */
async function maybeExpandManifest(url: string): Promise<string[] | null> {
  const key = archiveKeyFromUrl(url);
  if (!key || !/manifest\.json$/i.test(key)) return null;
  // Fetch JSON via public download (manifests are small and public).
  const dl = ARCHIVE_DL_PREFIX + key;
  try {
    const res = await fetch(dl);
    if (!res.ok) return null;
    const j = await res.json();
    if (j?.kind === 'split-pdf' && Array.isArray(j.pages)) {
      return j.pages.map((p: any) => p?.url).filter((u: any) => typeof u === 'string');
    }
  } catch {/* ignore */}
  return null;
}

async function collectUrls(rowData: any): Promise<string[]> {
  const raw = extractUrlsFromRowData(rowData);
  const out: string[] = [];
  for (const u of raw) {
    const expanded = await maybeExpandManifest(u);
    if (expanded && expanded.length > 0) {
      out.push(...expanded);
    } else {
      out.push(u);
    }
  }
  return Array.from(new Set(out));
}

async function loadRow(supabase: any, table: 'resources' | 'questions', id: number) {
  const { data, error } = await supabase.from(table).select('id, data').eq('id', id).single();
  if (error || !data) throw new Error(`${table} #${id} not found`);
  return data;
}

async function downloadHistoryVersion(key: string, n: number): Promise<{ blob: Blob; mime: string }> {
  const url = `https://archive.org/download/${ITEM}/history/files/${encodeURI(key)}.~${n}~`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`history fetch ${res.status} for ${key} v${n}`);
  const ct = res.headers.get('Content-Type') || 'application/octet-stream';
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_FILE_BYTES) {
    throw new Error(`history file too large (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)`);
  }
  return { blob: new Blob([buf], { type: ct }), mime: ct };
}

async function overwriteKey(key: string, blob: Blob, mime: string): Promise<void> {
  // Guess mediatype: images go under 'image', PDFs under 'texts'.
  const mediatype = mime.startsWith('image/') ? 'image' : 'texts';
  const encodedKey = key.split('/').map((s) => encodeURIComponent(s)).join('/');
  const res = await fetch(`${ITEM_S3}/${encodedKey}`, {
    method: 'PUT',
    headers: {
      Authorization: authHeader(),
      'x-amz-auto-make-bucket': '1',
      'x-archive-meta-mediatype': mediatype,
      'x-archive-meta-collection': 'opensource',
      'x-archive-keep-old-version': '1', // ensure new history entry is kept
      'Content-Type': mime || 'application/octet-stream',
    },
    body: blob,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`overwrite ${res.status}: ${t.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // ---- Auth ----
    const authHdr = req.headers.get('Authorization') || '';
    if (!authHdr.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHdr } },
    });
    const token = authHdr.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: 'Unauthorized' }, 401);

    const userId = claimsData.claims.sub as string;
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: isModData, error: roleErr } = await admin.rpc('is_moderator_or_admin', {
      _user_id: userId,
    });
    if (roleErr || !isModData) return json({ error: 'Forbidden' }, 403);

    // ---- Body ----
    const body = await req.json().catch(() => null);
    if (!body || !body.action) return json({ error: 'action required' }, 400);

    const action: string = body.action;
    const table: 'resources' | 'questions' = body.table;
    const id: number = body.id;

    if (!['resources', 'questions'].includes(table)) return json({ error: 'invalid table' }, 400);
    if (!Number.isInteger(id)) return json({ error: 'invalid id' }, 400);

    const row = await loadRow(admin, table, id);
    const urls = await collectUrls(row.data);
    const files = await fetchItemFiles();

    if (action === 'list') {
      const result = urls.map((u) => {
        const key = archiveKeyFromUrl(u);
        if (!key) return { url: u, key: null, versions: [] as HistoryVersion[] };
        return { url: u, key, versions: findHistoryVersions(files, key) };
      });
      return json({ urls: result });
    }

    if (action === 'restore') {
      const version = (body.version ?? 'earliest') as 'earliest' | 'previous' | number;
      let restored = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const u of urls) {
        const key = archiveKeyFromUrl(u);
        if (!key) { skipped++; continue; }
        const versions = findHistoryVersions(files, key);
        const pick = pickVersion(versions, version);
        if (!pick) { skipped++; continue; }
        try {
          const { blob, mime } = await downloadHistoryVersion(key, pick.n);
          await overwriteKey(key, blob, mime);
          restored++;
        } catch (e: any) {
          errors.push(`${key}: ${e?.message || String(e)}`);
        }
      }

      if (restored > 0) {
        await admin
          .from(table)
          .update({
            watermark_status: 'pending',
            pages_watermarked: 0,
            watermark_processed_at: null,
            watermark_error: null,
            watermarked_urls: [],
            watermark_stamp_count: null,
            watermark_overstamped: false,
            watermark_scan_at: null,
          })
          .eq('id', id);
      }

      return json({ restored, skipped, total: urls.length, errors });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error('pdf-rollback error:', err);
    return json({ error: err?.message || String(err) }, 500);
  }
});