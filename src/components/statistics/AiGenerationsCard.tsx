import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Bot, ChevronDown, Loader2, RefreshCw, Sparkles, FileText, ListOrdered, Image as ImageIcon, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { AI_MODELS, DEFAULT_MODELS, PROVIDER_LABEL, modelsForKind as modelsForKindFn, type AiProvider, type Kind as ModelKind } from './aiModels';
import { AiGenerationReviewDialog } from './AiGenerationReviewDialog';

type Kind = 'correction' | 'summary' | 'step_by_step' | 'infographic';
type TargetType = 'resource' | 'question';

const KINDS: { key: Kind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'correction', label: 'Correction', icon: Sparkles },
  { key: 'summary', label: 'Summary', icon: FileText },
  { key: 'step_by_step', label: 'Step-by-step', icon: ListOrdered },
  { key: 'infographic', label: 'Infographic', icon: ImageIcon },
];

interface Row {
  id: number;
  title: string;
  chapter_id: number | null;
  subject_id?: number | null;
}

interface GenStatus {
  status: 'queued' | 'running' | 'completed' | 'failed';
  error?: string | null;
  startedAt?: number; // epoch ms (from updated_at when running)
  id?: string;
  outputAnswerId?: number | null;
  proposedData?: string | null;
  reviewStatus?: 'pending' | 'approved' | 'discarded' | null;
}

const MODELS_STORAGE_KEY = 'ai-generations.selected-models';

function loadStoredModels(): string[] {
  try {
    const raw = localStorage.getItem(MODELS_STORAGE_KEY);
    if (!raw) return DEFAULT_MODELS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      const valid = parsed.filter((id) => AI_MODELS.some((m) => m.id === id));
      return valid.length > 0 ? valid : DEFAULT_MODELS;
    }
  } catch {}
  return DEFAULT_MODELS;
}

export const AiGenerationsCard: React.FC = () => {
  const [tab, setTab] = useState<TargetType>('resource');
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  // map key `${target_type}:${target_id}:${kind}:${model}` -> status
  const [statusMap, setStatusMap] = useState<Record<string, GenStatus>>({});
  // currently-open review dialog (keyed by statusMap key)
  const [reviewKey, setReviewKey] = useState<string | null>(null);
  // median duration in seconds, per `${kind}:${model}` (from recent completed runs of current tab)
  const [etaByKindModel, setEtaByKindModel] = useState<Record<string, { sec: number; n: number }>>({});
  // selected models (multi-select)
  const [selectedModels, setSelectedModels] = useState<string[]>(() => loadStoredModels());
  const [providerFilter, setProviderFilter] = useState<'all' | AiProvider>('all');
  // tick once a second to refresh elapsed counters
  const [, setNowTick] = useState(0);

  useEffect(() => {
    try { localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(selectedModels)); } catch {}
  }, [selectedModels]);

  const fetchRows = async () => {
    setLoading(true);
    try {
      if (tab === 'resource') {
        const { data } = await supabase
          .from('resources')
          .select('id, title, chapter_id, subject_id')
          .eq('deleted', false)
          .order('id', { ascending: false })
          .limit(100);
        setRows((data || []).map((r: any) => ({ id: r.id, title: r.title || `#${r.id}`, chapter_id: r.chapter_id, subject_id: r.subject_id })));
      } else {
        const { data } = await supabase
          .from('questions')
          .select('id, data, chapter_id, book')
          .eq('deleted', false)
          .order('id', { ascending: false })
          .limit(100);
        setRows((data || []).map((r: any) => ({ id: r.id, title: (r.book || r.data || '').toString().slice(0, 80) || `#${r.id}`, chapter_id: r.chapter_id })));
      }
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  };

  const fetchStatuses = async () => {
    const { data } = await supabase
      .from('ai_generations')
      .select('id, target_type, target_id, kind, model, status, error, updated_at, output_answer_id, proposed_data, review_status')
      .eq('target_type', tab)
      .order('updated_at', { ascending: false })
      .limit(1000);
    const next: Record<string, GenStatus> = {};
    for (const r of (data || []) as any[]) {
      const model = r.model || 'legacy';
      next[`${r.target_type}:${r.target_id}:${r.kind}:${model}`] = {
        status: r.status,
        error: r.error,
        startedAt: r.updated_at ? new Date(r.updated_at).getTime() : undefined,
        id: r.id,
        outputAnswerId: r.output_answer_id ?? null,
        proposedData: r.proposed_data ?? null,
        reviewStatus: r.review_status ?? null,
      };
    }
    setStatusMap(next);
  };

  const fetchEtas = async () => {
    const { data } = await supabase
      .from('ai_generations')
      .select('kind, model, created_at, updated_at')
      .eq('target_type', tab)
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })
      .limit(80);
    const buckets: Record<string, number[]> = {};
    // Edge function wall-clock is capped at 10 minutes; anything beyond
    // ~15 min is almost certainly a row that sat queued before running
    // (created_at is set at insert, updated_at when completed) and is not
    // a real generation duration. Drop those outliers so the ETA stays sane.
    const MAX_REAL_DURATION_SEC = 15 * 60;
    for (const r of (data || []) as any[]) {
      const dur = (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 1000;
      if (!Number.isFinite(dur) || dur <= 0) continue;
      if (dur > MAX_REAL_DURATION_SEC) continue;
      const key = `${r.kind}:${r.model || 'legacy'}`;
      (buckets[key] ||= []).push(dur);
    }
    const next: Record<string, { sec: number; n: number }> = {};
    for (const k of Object.keys(buckets)) {
      const arr = buckets[k].slice(0, 10).sort((a, b) => a - b);
      const mid = Math.floor(arr.length / 2);
      const median = arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
      next[k] = { sec: Math.round(median), n: arr.length };
    }
    setEtaByKindModel(next);
  };

  useEffect(() => {
    fetchRows();
    fetchStatuses();
    fetchEtas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // poll while anything is running
  useEffect(() => {
    const anyRunning = Object.values(statusMap).some((s) => s.status === 'running' || s.status === 'queued');
    if (!anyRunning) return;
    const tStatus = setInterval(() => { fetchStatuses(); fetchEtas(); }, 3000);
    const tTick = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => { clearInterval(tStatus); clearInterval(tTick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusMap, tab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.title.toLowerCase().includes(q) || String(r.id).includes(q));
  }, [rows, search]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  };

  const runFor = async (ids: number[], kinds: Kind[]) => {
    if (ids.length === 0 || kinds.length === 0) return;
    if (selectedModels.length === 0) {
      toast.error('Pick at least one model first');
      return;
    }
    setRunning(true);
    const now = Date.now();
    // optimistic mark as running
    setStatusMap((prev) => {
      const n = { ...prev };
      for (const id of ids) {
        for (const k of kinds) {
          for (const m of selectedModels) {
            // Skip mismatched kind/model so we don't show false spinners (infographic only for image models).
            const isImage = /image/i.test(m);
            if (k === 'infographic' ? !isImage : isImage) continue;
            n[`${tab}:${id}:${k}:${m}`] = { status: 'running', startedAt: now };
          }
        }
      }
      return n;
    });
    try {
      const { error } = await supabase.functions.invoke('ai-generate', {
        body: {
          targets: ids.map((id) => ({ target_type: tab, target_id: id })),
          kinds,
          models: selectedModels,
        },
      });
      if (error) throw error;
      toast.success(`Triggered ${kinds.length} action(s) × ${selectedModels.length} model(s) on ${ids.length} item(s)`);
      await fetchStatuses();
      await fetchEtas();
    } catch (e: any) {
      toast.error(e?.message || 'AI generation failed');
      await fetchStatuses();
    } finally {
      setRunning(false);
    }
  };

  const formatSecs = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '—';
    if (s < 60) return `${s}s`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
    return `${m}m${String(sec).padStart(2, '0')}s`;
  };

  const StatusPill: React.FC<{ s?: GenStatus; kind: Kind; model: string; rowKey: string }> = ({ s, kind, model, rowKey }) => {
    if (!s) return <span className="text-xs text-muted-foreground">—</span>;
    if (s.status === 'completed') {
      if (s.reviewStatus === 'pending' && s.proposedData && s.outputAnswerId) {
        return (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setReviewKey(rowKey); }}
            className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-1.5 py-0 text-[10px] font-medium text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
            title="New AI output pending review"
          >
            <AlertCircle className="h-3 w-3" /> Review
          </button>
        );
      }
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-600 inline" />;
    }
    if (s.status === 'running' || s.status === 'queued') {
      const elapsed = s.startedAt ? Math.max(0, Math.floor((Date.now() - s.startedAt) / 1000)) : 0;
      const eta = etaByKindModel[`${kind}:${model}`];
      const title = eta
        ? `Estimated from ${eta.n} past run(s): ~${formatSecs(eta.sec)}`
        : 'No estimate yet — first run';
      return (
        <span className="inline-flex items-center gap-1 text-blue-600 text-[11px] tabular-nums" title={title}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {eta ? `${formatSecs(elapsed)} / ~${formatSecs(eta.sec)}` : formatSecs(elapsed)}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-red-600" title={s.error || ''}>
        <AlertCircle className="h-3.5 w-3.5" />
      </span>
    );
  };

  const kindMenu = (ids: number[]) => (
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel>
        Generate for {ids.length} item(s) · {selectedModels.length} model(s)
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {KINDS.map((k) => (
        <DropdownMenuItem key={k.key} onClick={() => runFor(ids, [k.key])}>
          <k.icon className="h-4 w-4 mr-2" /> {k.label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => runFor(ids, KINDS.map((k) => k.key))}>
        <Sparkles className="h-4 w-4 mr-2" /> Generate all
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" /> AI Generations
              {(() => {
                const n = Object.values(statusMap).filter(
                  (s) => s.reviewStatus === 'pending' && s.proposedData && s.outputAnswerId,
                ).length;
                return n > 0 ? (
                  <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-3 w-3 mr-1" /> {n} pending review
                  </Badge>
                ) : null;
              })()}
            </CardTitle>
            <CardDescription>
              Trigger AI bots (Qwen, DeepSeek, Vision) to generate corrections, summaries,
              step-by-step explanations, and infographics. The first run for an item is
              published immediately; re-runs are held for admin review (Approve / Discard)
              before they replace the live answer.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => { fetchRows(); fetchStatuses(); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Model picker */}
        <div className="rounded-md border p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-medium">Models to run ({selectedModels.length} selected)</div>
            <div className="flex items-center gap-1 flex-wrap">
              {(['all', 'lovable', 'openrouter', 'ollama'] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={providerFilter === p ? 'default' : 'outline'}
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setProviderFilter(p)}
                >
                  {p === 'all' ? 'All' : PROVIDER_LABEL[p]}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                onClick={() => setSelectedModels(DEFAULT_MODELS)}
              >
                Reset
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AI_MODELS.filter((m) => providerFilter === 'all' || m.provider === providerFilter).map((m) => {
              const active = selectedModels.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    setSelectedModels((prev) =>
                      prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                    )
                  }
                  className={`text-[11px] rounded-full border px-2 py-0.5 transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-accent'
                  }`}
                  title={`${PROVIDER_LABEL[m.provider]} — ${m.id}`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Each selected model runs independently and produces its own bot answer.
            Infographic only uses image-capable models.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TargetType)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="resource">Resources</TabsTrigger>
            <TabsTrigger value="question">Questions</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="space-y-3 mt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Filter by title or id…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" disabled={selected.size === 0 || running}>
                    Bulk action ({selected.size}) <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                {kindMenu(Array.from(selected))}
              </DropdownMenu>
              {running && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={selected.size > 0 && selected.size === filtered.length}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead className="w-16">ID</TableHead>
                    <TableHead>Title</TableHead>
                    {KINDS.map((k) => (
                      <TableHead key={k.key} className="text-center min-w-[120px]">
                        <k.icon className="h-3.5 w-3.5 inline" />
                      </TableHead>
                    ))}
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4 + KINDS.length} className="text-center py-6 text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4 + KINDS.length} className="text-center py-6 text-muted-foreground">
                        No {tab}s found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">#{r.id}</TableCell>
                        <TableCell className="max-w-md truncate" title={r.title}>{r.title}</TableCell>
                        {KINDS.map((k) => (
                          <TableCell key={k.key} className="align-top">
                            <div className="flex flex-col gap-0.5">
                              {(() => {
                                const models = modelsForKindFn(k.key as ModelKind).filter((m) => selectedModels.includes(m.id));
                                if (models.length === 0) {
                                  return <span className="text-[10px] text-muted-foreground">—</span>;
                                }
                                return models.map((m) => (
                                  <div key={m.id} className="flex items-center gap-1 text-[10px]" title={m.label}>
                                    <StatusPill
                                      s={statusMap[`${tab}:${r.id}:${k.key}:${m.id}`]}
                                      kind={k.key}
                                      model={m.id}
                                      rowKey={`${tab}:${r.id}:${k.key}:${m.id}`}
                                    />
                                    <span className="truncate max-w-[100px] text-muted-foreground">{m.label}</span>
                                  </div>
                                ));
                              })()}
                            </div>
                          </TableCell>
                        ))}
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" disabled={running}>
                                <Sparkles className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            {kindMenu([r.id])}
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              <Clock className="h-3 w-3 inline mr-1" /> Generations can take several minutes for
              long documents (local Ollama or OpenRouter free-tier). Elapsed and estimated time
              are shown while running; hover the red icon for errors.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
    {(() => {
      if (!reviewKey) return null;
      const s = statusMap[reviewKey];
      if (!s || !s.id || !s.outputAnswerId || !s.proposedData) return null;
      // rowKey = `${tab}:${id}:${kind}:${model}` — extract kind/model for header.
      const parts = reviewKey.split(':');
      const kind = parts[2] ?? '';
      const model = parts.slice(3).join(':') ?? '';
      return (
        <AiGenerationReviewDialog
          open={true}
          onOpenChange={(o) => { if (!o) setReviewKey(null); }}
          generationId={s.id}
          answerId={s.outputAnswerId}
          kind={kind}
          model={model}
          proposedDataString={s.proposedData}
          onResolved={() => { setReviewKey(null); fetchStatuses(); }}
        />
      );
    })()}
  </>
  );
};