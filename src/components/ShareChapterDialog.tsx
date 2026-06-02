import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { SharedChaptersMultiSelect } from './SharedChaptersMultiSelect';

interface Props {
  open: boolean;
  onClose: () => void;
  chapterId: number;
  chapterName: string;
}

/**
 * Admin/moderator action: bulk-adds chapterId targets to `shared_with` on every
 * (non-deleted) resource and question that natively belongs to this chapter.
 */
export const ShareChapterDialog: React.FC<Props> = ({
  open,
  onClose,
  chapterId,
  chapterName,
}) => {
  const [targets, setTargets] = useState<number[]>([]);
  const [includeResources, setIncludeResources] = useState(true);
  const [includeQuestions, setIncludeQuestions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<{ resources: number; questions: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setTargets([]);
    setIncludeResources(true);
    setIncludeQuestions(true);
    setCounts(null);
    (async () => {
      const [{ count: rc }, { count: qc }] = await Promise.all([
        supabase.from('resources').select('id', { count: 'exact', head: true })
          .eq('chapter_id', chapterId).eq('deleted', false),
        supabase.from('questions').select('id', { count: 'exact', head: true })
          .eq('chapter_id', chapterId).eq('deleted', false),
      ]);
      setCounts({ resources: rc || 0, questions: qc || 0 });
    })();
  }, [open, chapterId]);

  const handleShare = async () => {
    if (targets.length === 0) {
      toast.error('Pick at least one target chapter');
      return;
    }
    if (!includeResources && !includeQuestions) {
      toast.error('Select resources or questions to share');
      return;
    }
    setBusy(true);
    try {
      let totalResources = 0;
      let totalQuestions = 0;

      if (includeResources) {
        const { data: rows, error } = await supabase
          .from('resources')
          .select('id, shared_with')
          .eq('chapter_id', chapterId)
          .eq('deleted', false);
        if (error) throw error;
        for (const row of rows || []) {
          const merged = Array.from(new Set([...(row.shared_with || []), ...targets]));
          if (merged.length === (row.shared_with || []).length) continue;
          const { error: upErr } = await supabase
            .from('resources')
            .update({ shared_with: merged })
            .eq('id', row.id);
          if (upErr) throw upErr;
          totalResources++;
        }
      }

      if (includeQuestions) {
        const { data: rows, error } = await supabase
          .from('questions')
          .select('id, shared_with')
          .eq('chapter_id', chapterId)
          .eq('deleted', false);
        if (error) throw error;
        for (const row of rows || []) {
          const current: number[] = (row as any).shared_with || [];
          const merged = Array.from(new Set([...current, ...targets]));
          if (merged.length === current.length) continue;
          const { error: upErr } = await supabase
            .from('questions')
            .update({ shared_with: merged } as any)
            .eq('id', row.id);
          if (upErr) throw upErr;
          totalQuestions++;
        }
      }

      toast.success(
        `Shared into ${targets.length} chapter${targets.length > 1 ? 's' : ''}: ` +
          `${totalResources} resource${totalResources === 1 ? '' : 's'}, ` +
          `${totalQuestions} question${totalQuestions === 1 ? '' : 's'} updated`,
      );
      onClose();
    } catch (err: any) {
      console.error('Share chapter failed:', err);
      toast.error(err?.message || 'Failed to share chapter');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 size={18} /> Share chapter
          </DialogTitle>
          <DialogDescription>
            Adds <span className="font-medium text-foreground">{chapterName}</span>'s content
            into the selected target chapters. Originals stay in this chapter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Target chapters</Label>
            <SharedChaptersMultiSelect
              value={targets}
              onChange={setTargets}
              excludeChapterId={chapterId}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <Label>What to share</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={includeResources}
                  onCheckedChange={(v) => setIncludeResources(v === true)}
                  disabled={busy}
                />
                <span>
                  Resources{counts ? ` (${counts.resources})` : ''}
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={includeQuestions}
                  onCheckedChange={(v) => setIncludeQuestions(v === true)}
                  disabled={busy}
                />
                <span>
                  Questions{counts ? ` (${counts.questions})` : ''}
                </span>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleShare} disabled={busy || targets.length === 0}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};