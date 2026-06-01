import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { CheckCircle2, X, Loader2, GitCompare } from 'lucide-react';
import { toast } from 'sonner';
import { diffWords, diffStats } from '@/utils/textDiff';

interface Props {
  table: 'resources' | 'questions';
  rowId: number;
  currentText: string | null;
  proposedText: string | null;
  proposedStatus: string | null;
  proposedReadability: string | null;
  onResolved: (next: {
    ocr_text: string | null;
    ocr_status: string | null;
    ocr_readability: string | null;
    ocr_text_proposed: null;
    ocr_text_proposed_at: null;
    ocr_text_proposed_readability: null;
    ocr_text_proposed_status: null;
  }) => void;
}

export function OcrReviewButton({
  table,
  rowId,
  currentText,
  proposedText,
  proposedStatus,
  proposedReadability,
  onResolved,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'discard' | null>(null);

  const chunks = useMemo(
    () => diffWords(currentText ?? '', proposedText ?? ''),
    [currentText, proposedText],
  );
  const stats = useMemo(() => diffStats(chunks), [chunks]);

  if (!proposedText) return null;

  const clearProposal = {
    ocr_text_proposed: null,
    ocr_text_proposed_at: null,
    ocr_text_proposed_readability: null,
    ocr_text_proposed_status: null,
  };

  const approve = async () => {
    setBusy('approve');
    try {
      const patch = {
        ocr_text: proposedText,
        ocr_status: proposedStatus,
        ocr_readability: proposedReadability,
        ocr_processed_at: new Date().toISOString(),
        ...clearProposal,
      };
      const { error } = await (supabase as any).from(table).update(patch).eq('id', rowId);
      if (error) throw error;
      onResolved({
        ocr_text: proposedText,
        ocr_status: proposedStatus,
        ocr_readability: proposedReadability,
        ...clearProposal,
      });
      toast.success('Proposed OCR applied');
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to apply proposed OCR');
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    setBusy('discard');
    try {
      const { error } = await (supabase as any).from(table).update(clearProposal).eq('id', rowId);
      if (error) throw error;
      onResolved({
        ocr_text: currentText,
        ocr_status: null, // unchanged — parent should not overwrite if null
        ocr_readability: null,
        ...clearProposal,
      });
      toast.success('Proposed OCR discarded');
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to discard proposed OCR');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 gap-1 text-[11px] border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <GitCompare className="h-3 w-3" />
        Review new OCR
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Review proposed OCR
              <Badge variant="outline" className="text-[10px]">
                +{stats.added} / −{stats.removed} chars
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Compare the current saved OCR with the new run. Approve to replace,
              or discard to keep the current version.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh]">
            <div className="border rounded-md overflow-hidden flex flex-col">
              <div className="px-3 py-1.5 text-xs font-medium bg-muted border-b">
                Current ({(currentText ?? '').length.toLocaleString()} chars)
              </div>
              <pre className="text-xs whitespace-pre-wrap break-words p-3 overflow-auto flex-1 font-mono">
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
            </div>
            <div className="border rounded-md overflow-hidden flex flex-col">
              <div className="px-3 py-1.5 text-xs font-medium bg-muted border-b">
                Proposed ({(proposedText ?? '').length.toLocaleString()} chars)
              </div>
              <pre className="text-xs whitespace-pre-wrap break-words p-3 overflow-auto flex-1 font-mono">
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
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              onClick={discard}
              disabled={busy !== null}
              className="gap-1"
            >
              {busy === 'discard' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              Discard
            </Button>
            <Button onClick={approve} disabled={busy !== null} className="gap-1">
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
    </>
  );
}