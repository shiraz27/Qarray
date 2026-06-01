import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { diffWords, diffStats } from '@/utils/textDiff';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generationId: string;
  answerId: number;
  kind: string;
  model: string;
  proposedDataString: string;
  /** Called after approve/discard so caller can refresh local state. */
  onResolved: (action: 'approved' | 'discarded') => void;
}

function extractRenderable(payload: any): {
  textual: string;
  svg: string | null;
} {
  if (!payload || typeof payload !== 'object') {
    return { textual: typeof payload === 'string' ? payload : '', svg: null };
  }
  if (typeof payload.svg === 'string' && payload.svg.includes('<svg')) {
    return { textual: '', svg: payload.svg };
  }
  if (typeof payload.content === 'string') {
    return { textual: payload.content, svg: null };
  }
  return { textual: JSON.stringify(payload, null, 2), svg: null };
}

export function AiGenerationReviewDialog({
  open,
  onOpenChange,
  generationId,
  answerId,
  kind,
  model,
  proposedDataString,
  onResolved,
}: Props) {
  const [currentDataString, setCurrentDataString] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'discard' | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('answers')
        .select('data')
        .eq('id', answerId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        setCurrentDataString(null);
      } else {
        setCurrentDataString((data?.data as string) ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, answerId]);

  const parsed = useMemo(() => {
    const safeParse = (s: string | null): any => {
      if (!s) return null;
      try {
        return JSON.parse(s);
      } catch {
        return s;
      }
    };
    return {
      current: extractRenderable(safeParse(currentDataString)),
      proposed: extractRenderable(safeParse(proposedDataString)),
    };
  }, [currentDataString, proposedDataString]);

  const chunks = useMemo(
    () => diffWords(parsed.current.textual, parsed.proposed.textual),
    [parsed],
  );
  const stats = useMemo(() => diffStats(chunks), [chunks]);

  const approve = async () => {
    setBusy('approve');
    try {
      const { error: e1 } = await supabase
        .from('answers')
        .update({ data: proposedDataString, deleted: false })
        .eq('id', answerId);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from('ai_generations')
        .update({ proposed_data: null, proposed_at: null, review_status: 'approved' })
        .eq('id', generationId);
      if (e2) throw e2;
      toast.success('Proposed generation applied');
      onResolved('approved');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to apply');
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    setBusy('discard');
    try {
      const { error } = await supabase
        .from('ai_generations')
        .update({ proposed_data: null, proposed_at: null, review_status: 'discarded' })
        .eq('id', generationId);
      if (error) throw error;
      toast.success('Proposed generation discarded');
      onResolved('discarded');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to discard');
    } finally {
      setBusy(null);
    }
  };

  const isSvgKind = parsed.current.svg !== null || parsed.proposed.svg !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Review proposed {kind}
            <Badge variant="outline" className="text-[10px]">{model}</Badge>
            {!isSvgKind && (
              <Badge variant="outline" className="text-[10px]">
                +{stats.added} / −{stats.removed} chars
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Compare the current bot answer with the new run. Approve to replace,
            or discard to keep the current version.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[65vh]">
          <div className="border rounded-md overflow-hidden flex flex-col">
            <div className="px-3 py-1.5 text-xs font-medium bg-muted border-b">
              Current
            </div>
            <div className="overflow-auto flex-1 p-3">
              {loading ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : parsed.current.svg ? (
                <div
                  className="bg-white rounded"
                  dangerouslySetInnerHTML={{ __html: parsed.current.svg }}
                />
              ) : (
                <pre className="text-xs whitespace-pre-wrap break-words font-mono">
                  {chunks.map((c, i) =>
                    c.type === 'del' ? (
                      <span
                        key={i}
                        className="bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200"
                      >
                        {c.text}
                      </span>
                    ) : c.type === 'eq' ? (
                      <span key={i}>{c.text}</span>
                    ) : null,
                  )}
                </pre>
              )}
            </div>
          </div>

          <div className="border rounded-md overflow-hidden flex flex-col">
            <div className="px-3 py-1.5 text-xs font-medium bg-muted border-b">
              Proposed
            </div>
            <div className="overflow-auto flex-1 p-3">
              {parsed.proposed.svg ? (
                <div
                  className="bg-white rounded"
                  dangerouslySetInnerHTML={{ __html: parsed.proposed.svg }}
                />
              ) : (
                <pre className="text-xs whitespace-pre-wrap break-words font-mono">
                  {chunks.map((c, i) =>
                    c.type === 'add' ? (
                      <span
                        key={i}
                        className="bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-200"
                      >
                        {c.text}
                      </span>
                    ) : c.type === 'eq' ? (
                      <span key={i}>{c.text}</span>
                    ) : null,
                  )}
                </pre>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={discard} disabled={busy !== null} className="gap-1">
            {busy === 'discard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Discard
          </Button>
          <Button onClick={approve} disabled={busy !== null || loading} className="gap-1">
            {busy === 'approve' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approve & replace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}