import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ShieldCheck, AlertCircle, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  runPdfHealthAudit,
  reportToCsv,
  type AuditProgress,
  type AuditResult,
  type AuditScope,
  type AuditKindFilter,
} from '@/utils/pdfHealthAudit';
import { PdfHealthScheduledReport } from './PdfHealthScheduledReport';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PdfHealthAuditPanel() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<AuditProgress | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<AuditScope>('skip-recent-healthy');
  const [kindFilter, setKindFilter] = useState<AuditKindFilter>('all');
  const [maxAgeDays, setMaxAgeDays] = useState<number>(7);
  const [limit, setLimit] = useState<string>('');

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress({ processed: 0, total: 0, brokenRows: 0 });
    try {
      const parsedLimit = limit.trim() ? Math.max(1, Number(limit)) : undefined;
      const res = await runPdfHealthAudit(
        {
          scope,
          kind: kindFilter,
          maxAgeDays: Number.isFinite(maxAgeDays) && maxAgeDays > 0 ? maxAgeDays : 7,
          limit: Number.isFinite(parsedLimit as number) ? parsedLimit : undefined,
        },
        (p) => setProgress(p),
      );
      setResult(res);
      toast.success(
        `Audit complete — ${res.totalBrokenPages} broken page(s) across ${res.rows.length} row(s)`,
      );
    } catch (e: any) {
      const msg = e?.message || 'Audit failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  const handleExport = () => {
    if (!result) return;
    const csv = reportToCsv(result);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pdf-health-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Split PDF Health Audit
        </CardTitle>
        <CardDescription>
          Scan every multi-page PDF manifest and verify each per-page file is parseable.
          Read-only — no changes are made to the database or storage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="scheduled">
          <TabsList>
            <TabsTrigger value="scheduled">Latest scheduled report</TabsTrigger>
            <TabsTrigger value="manual">Run scan now</TabsTrigger>
          </TabsList>
          <TabsContent value="scheduled" className="pt-4">
            <PdfHealthScheduledReport />
          </TabsContent>
          <TabsContent value="manual" className="pt-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as AuditScope)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip-recent-healthy">
                  Skip recently healthy
                </SelectItem>
                <SelectItem value="only-previously-broken">
                  Only previously broken
                </SelectItem>
                <SelectItem value="only-unchecked">
                  Only never-scanned
                </SelectItem>
                <SelectItem value="all">Re-check everything</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kind</Label>
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as AuditKindFilter)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Resources + questions</SelectItem>
                <SelectItem value="resource">Resources only</SelectItem>
                <SelectItem value="question">Questions only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Healthy cache window (days)
            </Label>
            <Input
              type="number"
              min={1}
              value={maxAgeDays}
              onChange={(e) => setMaxAgeDays(Number(e.target.value))}
              disabled={scope !== 'skip-recent-healthy'}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max rows (optional)</Label>
            <Input
              type="number"
              min={1}
              placeholder="No limit"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleRun} disabled={running} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {running ? 'Auditing…' : 'Validate split PDFs'}
          </Button>
          {result && (
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          )}
          {progress && (
            <span className="text-xs text-muted-foreground">
              {progress.processed}/{progress.total} rows
              {progress.currentLabel ? ` · ${progress.currentLabel}` : ''}
              {' · '}
              <span className="text-destructive">{progress.brokenRows} broken so far</span>
            </span>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
              <Stat label="Rows scanned" value={result.totalRowsScanned} />
              <Stat label="Pages checked" value={result.totalPagesChecked} />
              <Stat
                label="Broken pages"
                value={result.totalBrokenPages}
                tone={result.totalBrokenPages > 0 ? 'destructive' : 'ok'}
              />
              <Stat
                label="Unavailable pages"
                value={result.totalUnavailablePages}
                tone={result.totalUnavailablePages > 0 ? 'warn' : 'ok'}
              />
              <Stat label="Skipped (healthy)" value={result.skippedHealthy} />
              <Stat label="Skipped (filter)" value={result.skippedOutOfScope} />
            </div>

            {result.rows.length === 0 ? (
              <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                No broken split PDFs found. All manifests parsed successfully.
              </div>
            ) : (
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
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((r) => {
                      const href =
                        r.kind === 'resource' ? `/resource/${r.id}` : `/question/${r.id}`;
                      return (
                        <TableRow key={`${r.kind}-${r.id}-${r.manifestUrl}`}>
                          <TableCell>
                            <Badge variant="outline">{r.kind}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.id}</TableCell>
                          <TableCell className="max-w-[260px] truncate" title={r.title}>
                            {r.title || '—'}
                          </TableCell>
                          <TableCell className="text-xs">{r.totalPages || '?'}</TableCell>
                          <TableCell>
                            {r.brokenPages.length > 0 ? (
                              <Badge variant="destructive" className="font-mono text-xs">
                                {r.brokenPages.join(', ')}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {r.unavailablePages.length > 0 ? (
                              <Badge variant="secondary" className="font-mono text-xs">
                                {r.unavailablePages.join(', ')}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell
                            className="text-xs text-muted-foreground max-w-[200px] truncate"
                            title={r.manifestError}
                          >
                            {r.manifestError || ''}
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
        )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = 'ok',
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn' | 'destructive';
}) {
  const toneClass =
    tone === 'destructive'
      ? 'text-destructive'
      : tone === 'warn'
      ? 'text-yellow-600'
      : 'text-foreground';
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}