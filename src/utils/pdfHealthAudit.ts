import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { supabase } from '@/integrations/supabase/client';
import { fetchPdfViaProxy } from '@/utils/pdfMediaFetch';
import { fetchSplitPdfManifest } from '@/utils/splitPdfManifest';
import { isSplitPdfManifestUrl } from '@/utils/mediaTypeUtils';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export type PageHealth = 'ok' | 'broken' | 'unavailable';

export interface ManifestRowReport {
  kind: 'resource' | 'question';
  id: number;
  title: string;
  manifestUrl: string;
  totalPages: number;
  brokenPages: number[];
  unavailablePages: number[];
  manifestError?: string;
}

export interface AuditProgress {
  processed: number;
  total: number;
  brokenRows: number;
  currentLabel?: string;
}

export interface AuditResult {
  rows: ManifestRowReport[];
  totalRowsScanned: number;
  totalPagesChecked: number;
  totalBrokenPages: number;
  totalUnavailablePages: number;
  skippedHealthy: number;
  skippedOutOfScope: number;
}

export type AuditScope =
  | 'all'
  | 'skip-recent-healthy'
  | 'only-previously-broken'
  | 'only-unchecked';

export type AuditKindFilter = 'all' | 'resource' | 'question';

export interface AuditOptions {
  scope: AuditScope;
  /** Recency window in days for "skip-recent-healthy". Ignored otherwise. */
  maxAgeDays: number;
  kind: AuditKindFilter;
  /** Optional cap on number of manifests to scan (after filtering). */
  limit?: number;
}

interface LatestReport {
  brokenPages: number[];
  unavailablePages: number[];
  manifestError: string | null;
  checkedAt: string;
}

/** Latest scheduled report per (kind, content_id, manifest_url). */
async function loadLatestReportsIndex(): Promise<Map<string, LatestReport>> {
  const index = new Map<string, LatestReport>();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('pdf_health_reports')
      .select('kind, content_id, manifest_url, broken_pages, unavailable_pages, manifest_error, checked_at')
      .order('checked_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Health reports fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) {
      const key = `${r.kind}::${r.content_id}::${r.manifest_url}`;
      // ordered desc, so first wins
      if (!index.has(key)) {
        index.set(key, {
          brokenPages: r.broken_pages ?? [],
          unavailablePages: r.unavailable_pages ?? [],
          manifestError: r.manifest_error ?? null,
          checkedAt: r.checked_at,
        });
      }
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return index;
}

/** Collect resources + questions whose payload includes a manifest URL. */
async function collectManifestRows(): Promise<
  Array<{ kind: 'resource' | 'question'; id: number; title: string; manifestUrl: string }>
> {
  const out: Array<{
    kind: 'resource' | 'question';
    id: number;
    title: string;
    manifestUrl: string;
  }> = [];

  // Paginate resources (PostgREST default cap is 1000)
  const pageSize = 1000;
  let from = 0;
  // Pull all resources, then filter client-side (data is text[])
  while (true) {
    const { data, error } = await supabase
      .from('resources')
      .select('id, title, data, deleted')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Resources fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) {
      if (r.deleted) continue;
      const arr: string[] = Array.isArray(r.data) ? r.data : [];
      for (const u of arr) {
        if (typeof u === 'string' && isSplitPdfManifestUrl(u)) {
          out.push({ kind: 'resource', id: r.id, title: r.title ?? '', manifestUrl: u });
        }
      }
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Questions: data is text. Use ILIKE to filter server-side.
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, data, deleted')
      .ilike('data', '%pages/manifest%')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Questions fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const q of data as any[]) {
      if (q.deleted) continue;
      const text: string = q.data ?? '';
      // Extract every arc1:// or http(s) token that ends in a manifest path
      const matches = text.match(/(arc1:\/\/[A-Za-z0-9_\-=]+|https?:\/\/[^\s)"]+)/g) || [];
      const seen = new Set<string>();
      for (const u of matches) {
        if (isSplitPdfManifestUrl(u) && !seen.has(u)) {
          seen.add(u);
          out.push({
            kind: 'question',
            id: q.id,
            title: text.slice(0, 80),
            manifestUrl: u,
          });
        }
      }
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return out;
}

async function checkPage(url: string): Promise<PageHealth> {
  const fetched = await fetchPdfViaProxy(url);
  if (fetched.kind === 'unavailable') return 'unavailable';
  if (fetched.kind === 'error') return 'broken';
  try {
    const ab = await fetched.blob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab.slice(0) }).promise;
    try { await pdf.destroy(); } catch {}
    return 'ok';
  } catch {
    return 'broken';
  }
}

const PAGE_CONCURRENCY = 4;

async function checkManifestRow(
  row: { kind: 'resource' | 'question'; id: number; title: string; manifestUrl: string },
): Promise<ManifestRowReport> {
  const report: ManifestRowReport = {
    ...row,
    totalPages: 0,
    brokenPages: [],
    unavailablePages: [],
  };
  let manifest;
  try {
    manifest = await fetchSplitPdfManifest(row.manifestUrl);
  } catch (e) {
    report.manifestError = e instanceof Error ? e.message : 'Manifest fetch failed';
    return report;
  }
  report.totalPages = manifest.totalPages;

  const queue = [...manifest.pages];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < PAGE_CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (queue.length) {
          const p = queue.shift();
          if (!p) return;
          const health = await checkPage(p.url);
          if (health === 'broken') report.brokenPages.push(p.n);
          else if (health === 'unavailable') report.unavailablePages.push(p.n);
        }
      })(),
    );
  }
  await Promise.all(workers);
  report.brokenPages.sort((a, b) => a - b);
  report.unavailablePages.sort((a, b) => a - b);
  return report;
}

export async function runPdfHealthAudit(
  onProgress?: (p: AuditProgress) => void,
): Promise<AuditResult> {
  const rows = await collectManifestRows();
  const total = rows.length;
  let processed = 0;
  let brokenRows = 0;
  let totalPagesChecked = 0;
  let totalBrokenPages = 0;
  let totalUnavailablePages = 0;
  const reports: ManifestRowReport[] = [];

  onProgress?.({ processed: 0, total, brokenRows: 0 });

  // Row-level concurrency = 2 (page-level is 4 inside each row)
  const rowQueue = [...rows];
  const ROW_CONCURRENCY = 2;
  const workers: Promise<void>[] = [];
  for (let i = 0; i < ROW_CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (rowQueue.length) {
          const row = rowQueue.shift();
          if (!row) return;
          onProgress?.({
            processed,
            total,
            brokenRows,
            currentLabel: `${row.kind} #${row.id}`,
          });
          const report = await checkManifestRow(row);
          totalPagesChecked += report.totalPages;
          totalBrokenPages += report.brokenPages.length;
          totalUnavailablePages += report.unavailablePages.length;
          if (report.brokenPages.length > 0 || report.manifestError) {
            brokenRows++;
            reports.push(report);
          }
          processed++;
          onProgress?.({ processed, total, brokenRows });
        }
      })(),
    );
  }
  await Promise.all(workers);

  reports.sort((a, b) => (a.kind === b.kind ? a.id - b.id : a.kind.localeCompare(b.kind)));

  return {
    rows: reports,
    totalRowsScanned: total,
    totalPagesChecked,
    totalBrokenPages,
    totalUnavailablePages,
  };
}

export function reportToCsv(result: AuditResult): string {
  const header = [
    'kind',
    'id',
    'title',
    'manifest_url',
    'total_pages',
    'broken_pages',
    'unavailable_pages',
    'manifest_error',
  ].join(',');
  const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const lines = result.rows.map((r) =>
    [
      r.kind,
      String(r.id),
      esc(r.title),
      esc(r.manifestUrl),
      String(r.totalPages),
      esc(r.brokenPages.join(' ')),
      esc(r.unavailablePages.join(' ')),
      esc(r.manifestError ?? ''),
    ].join(','),
  );
  return [header, ...lines].join('\n');
}