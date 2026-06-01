import { useMemo, useState } from 'react';
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
import { Loader2, Sparkles, CheckCircle2, X, GitCompare } from 'lucide-react';
import { toast } from 'sonner';
import { diffWords, diffStats } from '@/utils/textDiff';

interface Props {
  resourceId: number;
  hasOcrText: boolean;
  currentDescription: string | null;
  proposedDescription: string | null;
  proposedModel?: string | null;
  onUpdated: (patch: {
    description?: string | null;
    description_proposed: string | null;
    description_proposed_at: string | null;
    description_proposed_status: string | null;
    description_proposed_model: string | null;
  }) => void;
}

export function DescriptionAiButton({
  resourceId,
  hasOcrText,
  currentDescription,
  proposedDescription,
  proposedModel,
  onUpdated,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'discard' | null>(null);

  const chunks = useMemo(
    () => diffWords(currentDescription ?? '', proposedDescription ?? ''),
    [currentDescription, proposedDescription],
  );
  const stats = useMemo(() => diffStats(chunks), [chunks]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: { action: 'describe_resource', resource_id: resourceId },
      });
      if (error) throw error;
      const res = data as {
        description?: string | null;
        description_proposed?: string | null;
        description_proposed_at?: string | null;
        description_proposed_status?: string | null;
        description_proposed_model?: string | null;
        proposed?: boolean;
      };
      onUpdated({
        description: res.description ?? currentDescription,
        description_proposed: res.description_proposed ?? null,
        description_proposed_at: res.description_proposed_at ?? null,
        description_proposed_status: res.description_proposed_status ?? null,
        description_proposed_model: res.description_proposed_model ?? null,
      });
      toast.success(res.proposed ? 'Description proposal ready — click Review' : 'Description generated');
      if (res.proposed) setReviewOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? 'AI description failed');
    } finally {
      setGenerating(false);
    }
  };

  const clearProposal = {
    description_proposed: null,
    description_proposed_at: null,
    description_proposed_status: null,
    description_proposed_model: null,
  };

  const approve = async () => {
    if (!proposedDescription) return;
    setBusy('approve');
    try {
      const { error } = await (supabase as any)
        .from('resources')
        .update({ description: proposedDescription, ...clearProposal })
        .eq('id', resourceId);
      if (error) throw error;
      onUpdated({ description: proposedDescription, ...clearProposal });
      toast.success('Description applied');
      setReviewOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to apply description');
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    setBusy('discard');
    try {
      const { error } = await (supabase as any)
        .from('resources')
        .update(clearProposal)
        .eq('id', resourceId);
      if (error) throw error;
      onUpdated({ ...clearProposal });
      toast.success('Proposed description discarded');
      setReviewOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to discard');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={generate}
        disabled={generating || !hasOcrText}
        title={
          !hasOcrText
            ? 'Run OCR first — description AI needs source text'
            : 'Generate description with AI'
        }
      >
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 text-violet-600" />
        )}
      </Button>

      {proposedDescription && !generating && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 gap-1 text-[11px] border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
          onClick={() => setReviewOpen(true)}
          title="Review proposed description"
        >
          <GitCompare className="h-3 w-3" />
          Review
        </Button>
      )}

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-3xl w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Review proposed description
              <Badge variant="outline" className="text-[10px]">
                +{stats.added} / −{stats.removed} chars
              </Badge>
              {proposedModel && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  {proposedModel}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Compare the current description with the AI proposal. Approve to replace,
              discard to keep the current text.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[55vh]">
            <div className="border rounded-md overflow-hidden flex flex-col">
              <div className="px-3 py-1.5 text-xs font-medium bg-muted border-b">
                Current ({(currentDescription ?? '').length.toLocaleString()} chars)
              </div>
              <pre className="text-xs whitespace-pre-wrap break-words p-3 overflow-auto flex-1 font-sans">
                {chunks.map((c, i) =>
                  c.type === 'del' ? (
                    <span key={i} className="bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200">
                      {c.text}
                    </span>
                  ) : c.type === 'eq' ? (
                    <span key={i}>{c.text}</span>
                  ) : null,
                )}
              </pre>
            </div>
            <div className="border rounded-md overflow-hidden flex flex-col">
              <div className="px-3 py-1.5 text-xs font-medium bg-muted border-b">
                Proposed ({(proposedDescription ?? '').length.toLocaleString()} chars)
              </div>
              <pre className="text-xs whitespace-pre-wrap break-words p-3 overflow-auto flex-1 font-sans">
                {chunks.map((c, i) =>
                  c.type === 'add' ? (
                    <span key={i} className="bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-200">
                      {c.text}
                    </span>
                  ) : c.type === 'eq' ? (
                    <span key={i}>{c.text}</span>
                  ) : null,
                )}
              </pre>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={discard} disabled={busy !== null} className="gap-1">
              {busy === 'discard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Discard
            </Button>
            <Button onClick={approve} disabled={busy !== null} className="gap-1">
              {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Approve & replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}