import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Upload,
  Image as ImageIcon,
  Bot,
  Database,
  ShieldAlert,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Alert {
  id: string;
  severity: 'warn' | 'critical';
  message: string;
  category: string;
}

interface Snapshot {
  generated_at: string;
  alerts: Alert[];
  sections: {
    upload: { events_24h: number; failures_24h: number; failures_1h: number; recent: any[] };
    media: {
      preview_failures_24h: number;
      preview_failures_1h: number;
      download_failures_24h: number;
      download_failures_1h: number;
      pdf_pages_broken: number;
      pdf_pages_unavailable: number;
      pdf_manifest_errors: number;
      recent: any[];
    };
    ai: {
      total_24h: number;
      failed_24h: number;
      failure_rate: number;
      by_kind: Record<string, Record<string, number>>;
    };
    events: { total_24h: number; by_severity: Record<string, number> };
    quality: {
      resources: {
        total: number;
        missing_ocr: number;
        missing_readability: number;
        missing_page_count: number;
        missing_source_link: number;
        ocr_coverage_pct: number;
      };
      questions: { total: number; missing_ocr: number; missing_readability: number };
    };
  };
}

const StatBlock: React.FC<{ label: string; value: React.ReactNode; tone?: 'default' | 'warn' | 'crit' | 'ok' }> = ({
  label,
  value,
  tone = 'default',
}) => (
  <div
    className={`rounded-md border p-3 ${
      tone === 'crit'
        ? 'border-red-500/40 bg-red-500/5'
        : tone === 'warn'
        ? 'border-yellow-500/40 bg-yellow-500/5'
        : tone === 'ok'
        ? 'border-green-500/30 bg-green-500/5'
        : ''
    }`}
  >
    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-1 text-2xl font-semibold">{value}</div>
  </div>
);

export const MonitoringPanel: React.FC = () => {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke('health-snapshot');
      if (error) throw error;
      setSnap(data as Snapshot);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" /> App Health Monitoring
            </CardTitle>
            <CardDescription>
              Live signals from uploads, media delivery, AI, and content quality.
              Auto-refreshes every 60s.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {snap && <span>Updated {new Date(snap.generated_at).toLocaleTimeString()}</span>}
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {err && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            {err}
          </div>
        )}

        {/* Alerts */}
        {snap && (
          <div className="space-y-2">
            {snap.alerts.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-green-500/40 bg-green-500/5 px-3 py-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                All systems nominal. No active alerts.
              </div>
            ) : (
              snap.alerts.map((a) => (
                <div
                  key={a.id}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    a.severity === 'critical'
                      ? 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300'
                      : 'border-yellow-500/50 bg-yellow-500/10 text-yellow-800 dark:text-yellow-300'
                  }`}
                >
                  {a.severity === 'critical' ? (
                    <ShieldAlert className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {a.severity}
                  </Badge>
                  <span className="flex-1">{a.message}</span>
                  <span className="text-[10px] text-muted-foreground">{a.category}</span>
                </div>
              ))
            )}
          </div>
        )}

        {snap && (
          <Tabs defaultValue="overview">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="upload">
                <Upload className="h-3.5 w-3.5 mr-1" /> Uploads
              </TabsTrigger>
              <TabsTrigger value="media">
                <ImageIcon className="h-3.5 w-3.5 mr-1" /> Media
              </TabsTrigger>
              <TabsTrigger value="ai">
                <Bot className="h-3.5 w-3.5 mr-1" /> AI
              </TabsTrigger>
              <TabsTrigger value="quality">
                <Database className="h-3.5 w-3.5 mr-1" /> Quality
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatBlock
                  label="Upload fails (24h)"
                  value={snap.sections.upload.failures_24h}
                  tone={snap.sections.upload.failures_1h >= 5 ? 'crit' : snap.sections.upload.failures_24h > 0 ? 'warn' : 'ok'}
                />
                <StatBlock
                  label="Media fails (24h)"
                  value={snap.sections.media.preview_failures_24h + snap.sections.media.download_failures_24h}
                  tone={
                    snap.sections.media.preview_failures_1h + snap.sections.media.download_failures_1h >= 5
                      ? 'crit'
                      : 'ok'
                  }
                />
                <StatBlock
                  label="AI failure rate"
                  value={`${snap.sections.ai.failure_rate}%`}
                  tone={snap.sections.ai.failure_rate >= 50 ? 'crit' : snap.sections.ai.failure_rate >= 25 ? 'warn' : 'ok'}
                />
                <StatBlock
                  label="Broken PDF pages"
                  value={snap.sections.media.pdf_pages_broken}
                  tone={snap.sections.media.pdf_pages_broken > 20 ? 'warn' : 'ok'}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(['info', 'warn', 'error', 'critical'] as const).map((s) => (
                  <StatBlock
                    key={s}
                    label={`Events ${s}`}
                    value={snap.sections.events.by_severity[s] ?? 0}
                    tone={s === 'critical' ? 'crit' : s === 'error' ? 'warn' : 'default'}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="upload" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatBlock label="Failures (24h)" value={snap.sections.upload.failures_24h} />
                <StatBlock
                  label="Failures (1h)"
                  value={snap.sections.upload.failures_1h}
                  tone={snap.sections.upload.failures_1h >= 5 ? 'crit' : 'default'}
                />
                <StatBlock label="Total events (24h)" value={snap.sections.upload.events_24h} />
              </div>
              <RecentEventsTable rows={snap.sections.upload.recent} />
            </TabsContent>

            <TabsContent value="media" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatBlock label="Preview fails (24h)" value={snap.sections.media.preview_failures_24h} />
                <StatBlock label="Download fails (24h)" value={snap.sections.media.download_failures_24h} />
                <StatBlock label="Broken pages" value={snap.sections.media.pdf_pages_broken} />
                <StatBlock label="Manifest errors" value={snap.sections.media.pdf_manifest_errors} />
              </div>
              <RecentEventsTable rows={snap.sections.media.recent} />
            </TabsContent>

            <TabsContent value="ai" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatBlock label="Total runs (24h)" value={snap.sections.ai.total_24h} />
                <StatBlock
                  label="Failed (24h)"
                  value={snap.sections.ai.failed_24h}
                  tone={snap.sections.ai.failure_rate >= 25 ? 'warn' : 'default'}
                />
                <StatBlock label="Failure rate" value={`${snap.sections.ai.failure_rate}%`} />
              </div>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kind</TableHead>
                      <TableHead className="text-center">Queued</TableHead>
                      <TableHead className="text-center">Running</TableHead>
                      <TableHead className="text-center">Completed</TableHead>
                      <TableHead className="text-center">Failed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(snap.sections.ai.by_kind).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No AI runs in the last 24h.
                        </TableCell>
                      </TableRow>
                    ) : (
                      Object.entries(snap.sections.ai.by_kind).map(([kind, st]) => (
                        <TableRow key={kind}>
                          <TableCell className="font-medium">{kind}</TableCell>
                          <TableCell className="text-center">{st.queued ?? 0}</TableCell>
                          <TableCell className="text-center">{st.running ?? 0}</TableCell>
                          <TableCell className="text-center">{st.completed ?? 0}</TableCell>
                          <TableCell className="text-center text-red-600">{st.failed ?? 0}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="quality" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatBlock
                  label="Resources OCR coverage"
                  value={`${snap.sections.quality.resources.ocr_coverage_pct}%`}
                  tone={snap.sections.quality.resources.ocr_coverage_pct < 30 ? 'warn' : 'ok'}
                />
                <StatBlock
                  label="Resources missing readability"
                  value={snap.sections.quality.resources.missing_readability}
                />
                <StatBlock
                  label="Resources missing page count"
                  value={snap.sections.quality.resources.missing_page_count}
                />
                <StatBlock
                  label="Resources missing source"
                  value={snap.sections.quality.resources.missing_source_link}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatBlock label="Total resources" value={snap.sections.quality.resources.total} />
                <StatBlock label="Total questions" value={snap.sections.quality.questions.total} />
                <StatBlock
                  label="Questions missing OCR"
                  value={snap.sections.quality.questions.missing_ocr}
                />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};

const RecentEventsTable: React.FC<{ rows: any[] }> = ({ rows }) => {
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
        No recent failure events.
      </div>
    );
  }
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">When</TableHead>
            <TableHead className="w-20">Severity</TableHead>
            <TableHead className="w-32">Event</TableHead>
            <TableHead>Message</TableHead>
            <TableHead className="w-28">Content</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString()}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    r.severity === 'critical'
                      ? 'border-red-500 text-red-700 dark:text-red-300'
                      : 'border-yellow-500 text-yellow-700 dark:text-yellow-300'
                  }
                >
                  {r.severity}
                </Badge>
              </TableCell>
              <TableCell className="text-xs">{r.event_type}</TableCell>
              <TableCell className="text-xs max-w-md truncate" title={r.message ?? ''}>
                {r.message}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.content_type ? `${r.content_type}#${r.content_id ?? '?'}` : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};