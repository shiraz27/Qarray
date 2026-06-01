import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Flag, ExternalLink, Check, X, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Report {
  id: string;
  content_type: 'resource' | 'question' | 'answer';
  content_id: number;
  reporter_id: string;
  reason: string;
  details: string | null;
  status: 'open' | 'reviewed' | 'dismissed';
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  reporter_name?: string;
}

const REASON_LABELS: Record<string, string> = {
  inappropriate: 'Inappropriate',
  quality: 'Low quality',
  missing: 'Missing/broken',
  incorrect: 'Incorrect',
  spam: 'Spam',
  other: 'Other',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-100 text-red-800 border-red-200',
  reviewed: 'bg-green-100 text-green-800 border-green-200',
  dismissed: 'bg-muted text-muted-foreground',
};

function contentLink(r: Report): string {
  if (r.content_type === 'resource') return `/resource/${r.content_id}`;
  // both question and answer link to the question page
  return `/question/${r.content_id}`;
}

export function ReportsCard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('content_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (typeFilter !== 'all') q = q.eq('content_type', typeFilter);
      if (reasonFilter !== 'all') q = q.eq('reason', reasonFilter);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Report[];

      // resolve reporter names
      const ids = Array.from(new Set(rows.map((r) => r.reporter_id)));
      let nameMap: Record<string, string> = {};
      if (ids.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', ids);
        nameMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.user_id, p.full_name]));
      }
      setReports(rows.map((r) => ({ ...r, reporter_name: nameMap[r.reporter_id] ?? 'Unknown' })));
    } catch (e) {
      toast({ title: 'Failed to load reports', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, reasonFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const updateStatus = async (id: string, status: 'reviewed' | 'dismissed' | 'open') => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const payload: Record<string, unknown> = {
        status,
        reviewed_by: status === 'open' ? null : auth.user?.id ?? null,
        reviewed_at: status === 'open' ? null : new Date().toISOString(),
      };
      if (notesDraft[id] !== undefined) payload.admin_notes = notesDraft[id];
      const { error } = await supabase.from('content_reports').update(payload as never).eq('id', id);
      if (error) throw error;
      toast({ title: `Marked ${status}` });
      fetchReports();
    } catch (e) {
      toast({ title: 'Update failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const openCount = reports.filter((r) => r.status === 'open').length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <Flag size={18} />
            Content reports
            {openCount > 0 && (
              <Badge variant="destructive" className="ml-1">{openCount} open shown</Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchReports} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="resource">Resources</SelectItem>
              <SelectItem value="question">Questions</SelectItem>
              <SelectItem value="answer">Answers</SelectItem>
            </SelectContent>
          </Select>
          <Select value={reasonFilter} onValueChange={setReasonFilter}>
            <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reasons</SelectItem>
              {Object.entries(REASON_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No reports.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Reporter</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => {
                  const isOpen = expanded === r.id;
                  return (
                    <>
                      <TableRow key={r.id}>
                        <TableCell>
                          <button
                            onClick={() => setExpanded(isOpen ? null : r.id)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs">{r.reporter_name}</TableCell>
                        <TableCell className="text-xs">
                          <Link to={contentLink(r)} className="inline-flex items-center gap-1 text-primary hover:underline">
                            {r.content_type} #{r.content_id}
                            <ExternalLink size={12} />
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline">{REASON_LABELS[r.reason] ?? r.reason}</Badge>
                        </TableCell>
                        <TableCell className="text-xs max-w-[260px] truncate" title={r.details ?? ''}>
                          {r.details ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded text-xs border ${STATUS_COLORS[r.status]}`}>
                            {r.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {r.status !== 'reviewed' && (
                              <Button size="sm" variant="ghost" onClick={() => updateStatus(r.id, 'reviewed')}>
                                <Check size={14} />
                              </Button>
                            )}
                            {r.status !== 'dismissed' && (
                              <Button size="sm" variant="ghost" onClick={() => updateStatus(r.id, 'dismissed')}>
                                <X size={14} />
                              </Button>
                            )}
                            {r.status !== 'open' && (
                              <Button size="sm" variant="ghost" onClick={() => updateStatus(r.id, 'open')}>
                                Reopen
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={`${r.id}-x`}>
                          <TableCell colSpan={8} className="bg-muted/40">
                            <div className="p-3 space-y-3">
                              {r.details && (
                                <div>
                                  <p className="text-xs font-semibold mb-1">Reporter details</p>
                                  <p className="text-sm whitespace-pre-wrap">{r.details}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-xs font-semibold mb-1">Admin notes</p>
                                <Textarea
                                  defaultValue={r.admin_notes ?? ''}
                                  onChange={(e) =>
                                    setNotesDraft((d) => ({ ...d, [r.id]: e.target.value }))
                                  }
                                  rows={2}
                                  placeholder="Internal notes…"
                                />
                              </div>
                              {r.reviewed_at && (
                                <p className="text-xs text-muted-foreground">
                                  Last reviewed {new Date(r.reviewed_at).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}