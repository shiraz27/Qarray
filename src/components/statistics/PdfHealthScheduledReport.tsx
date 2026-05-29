import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, RefreshCw, Download, ExternalLink } from 'lucide-react';

interface Row {
  id: string;
  kind: 'resource' | 'question';
  content_id: number;
  title: string | null;
  manifest_url: string;
  total_pages: number;
  broken_pages: number[];
  unavailable_pages: number[];
  manifest_error: string | null;
  checked_at: string;
}

export function PdfHealthScheduledReport() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Pull only the rows that have actual problems.
      const { data, error } = await supabase
        .from('pdf_health_reports')
        .select('*')
        .order('checked_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const filtered = (data ?? []).filter(
        (r: any) =>
          (r.broken_pages?.length ?? 0) > 0 ||
          (r.unavailable_pages?.length ?? 0) > 0 ||
          r.manifest_error,
      );
      setRows(filtered as Row[]);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleExport = () => {
    if (!rows || rows.length === 0) return;
    const header = [
      'kind', 'id', 'title', 'manifest_url',
      'total_pages', 'broken_pages', 'unavailable_pages',
      'manifest_error', 'checked_at',
    ].join(',');
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((r) => [
      r.kind,
      String(r.content_id),
      esc(r.title ?? ''),
      esc(r.manifest_url),
      String(r.total_pages),
      esc(r.broken_pages.join(' ')),
      esc(r.unavailable_pages.join(' ')),
      esc(r.manifest_error ?? ''),
      r.checked_at,
    ].join(','));
    const blob = new Blob([[header, ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pdf-health-scheduled-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const latest = rows && rows.length > 0
    ? new Date(rows[0].checked_at).toLocaleString()
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
        {rows && rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {rows == null
            ? 'Loading…'
            : rows.length === 0
              ? 'No broken manifests in the latest scheduled scan.'
              : `${rows.length} broken manifest(s) · last scan ${latest}`}
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Pages</TableHead>
                <TableHead>Broken</TableHead>
                <TableHead>Unavailable</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Checked</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const href = r.kind === 'resource'
                  ? `/resource/${r.content_id}`
                  : `/question/${r.content_id}`;
                return (
                  <TableRow key={r.id}>
                    <TableCell><Badge variant="outline">{r.kind}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{r.content_id}</TableCell>
                    <TableCell className="max-w-[260px] truncate" title={r.title ?? ''}>
                      {r.title || '—'}
                    </TableCell>
                    <TableCell className="text-xs">{r.total_pages || '?'}</TableCell>
                    <TableCell>
                      {r.broken_pages.length > 0 ? (
                        <Badge variant="destructive" className="font-mono text-xs">
                          {r.broken_pages.join(', ')}
                        </Badge>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {r.unavailable_pages.length > 0 ? (
                        <Badge variant="secondary" className="font-mono text-xs">
                          {r.unavailable_pages.join(', ')}
                        </Badge>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={r.manifest_error ?? ''}>
                      {r.manifest_error || ''}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.checked_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild className="gap-1">
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}