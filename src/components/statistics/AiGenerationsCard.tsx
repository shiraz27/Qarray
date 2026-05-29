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
}

export const AiGenerationsCard: React.FC = () => {
  const [tab, setTab] = useState<TargetType>('resource');
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  // map key `${target_type}:${target_id}:${kind}` -> status
  const [statusMap, setStatusMap] = useState<Record<string, GenStatus>>({});

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
      .select('target_type, target_id, kind, status, error')
      .eq('target_type', tab)
      .order('updated_at', { ascending: false })
      .limit(1000);
    const next: Record<string, GenStatus> = {};
    for (const r of (data || []) as any[]) {
      next[`${r.target_type}:${r.target_id}:${r.kind}`] = { status: r.status, error: r.error };
    }
    setStatusMap(next);
  };

  useEffect(() => {
    fetchRows();
    fetchStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // poll while anything is running
  useEffect(() => {
    const anyRunning = Object.values(statusMap).some((s) => s.status === 'running' || s.status === 'queued');
    if (!anyRunning) return;
    const t = setInterval(fetchStatuses, 3000);
    return () => clearInterval(t);
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
    setRunning(true);
    // optimistic mark as running
    setStatusMap((prev) => {
      const n = { ...prev };
      for (const id of ids) for (const k of kinds) n[`${tab}:${id}:${k}`] = { status: 'running' };
      return n;
    });
    try {
      const { error } = await supabase.functions.invoke('ai-generate', {
        body: {
          targets: ids.map((id) => ({ target_type: tab, target_id: id })),
          kinds,
        },
      });
      if (error) throw error;
      toast.success(`Triggered ${kinds.length} generation(s) on ${ids.length} item(s)`);
      await fetchStatuses();
    } catch (e: any) {
      toast.error(e?.message || 'AI generation failed');
      await fetchStatuses();
    } finally {
      setRunning(false);
    }
  };

  const StatusPill: React.FC<{ s?: GenStatus }> = ({ s }) => {
    if (!s) return <span className="text-xs text-muted-foreground">—</span>;
    if (s.status === 'completed') return <CheckCircle2 className="h-3.5 w-3.5 text-green-600 inline" />;
    if (s.status === 'running' || s.status === 'queued') return <Loader2 className="h-3.5 w-3.5 animate-spin inline text-blue-600" />;
    return (
      <span className="inline-flex items-center gap-1 text-red-600" title={s.error || ''}>
        <AlertCircle className="h-3.5 w-3.5" />
      </span>
    );
  };

  const kindMenu = (ids: number[]) => (
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel>Generate for {ids.length} item(s)</DropdownMenuLabel>
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" /> AI Generations
            </CardTitle>
            <CardDescription>
              Trigger AI bots (Qwen, DeepSeek, Vision) to generate corrections, summaries,
              step-by-step explanations, and infographics. Output appears as bot-authored
              answers users can vote on.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => { fetchRows(); fetchStatuses(); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
                      <TableHead key={k.key} className="text-center w-16">
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
                          <TableCell key={k.key} className="text-center">
                            <StatusPill s={statusMap[`${tab}:${r.id}:${k.key}`]} />
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
              <Clock className="h-3 w-3 inline mr-1" /> Generations run via OpenRouter free-tier
              models. Rate limits may cause failures — hover the red icon for the error.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};