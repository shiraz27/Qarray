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
import { Loader2, Plus, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  open: boolean;
  onClose: () => void;
  chapterId: number;
  chapterName: string;
}

interface ClassRow { id: number; name: string }
interface SubjectRow { id: number; name: string; class_id: number | null }
interface TargetRow {
  key: string;
  classId: number | null;
  subjectId: number | null;
  chapterName: string;
  /** If user picked an existing chapter, its id. Otherwise null and we'll create on save. */
  existingChapterId: number | null;
  /** Existing chapters in chosen subject (for the picker) */
  options: { id: number; name: string }[];
}

const makeRow = (chapterName: string): TargetRow => ({
  key: Math.random().toString(36).slice(2),
  classId: null,
  subjectId: null,
  chapterName,
  existingChapterId: null,
  options: [],
});

/**
 * Admin/moderator action: shares the source chapter into other (class, subject)
 * pairs. For each pair, a target chapter with the same name as the source is
 * resolved (or created on save), then its id is appended to `shared_with` on
 * every (non-deleted) resource and question belonging to the source chapter.
 */
export const ShareChapterDialog: React.FC<Props> = ({
  open,
  onClose,
  chapterId,
  chapterName,
}) => {
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjectsByClass, setSubjectsByClass] = useState<Record<number, SubjectRow[]>>({});
  const [includeResources, setIncludeResources] = useState(true);
  const [includeQuestions, setIncludeQuestions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<{ resources: number; questions: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows([makeRow(chapterName)]);
    setIncludeResources(true);
    setIncludeQuestions(true);
    setCounts(null);
    (async () => {
      const [{ count: rc }, { count: qc }, classRes] = await Promise.all([
        supabase.from('resources').select('id', { count: 'exact', head: true })
          .eq('chapter_id', chapterId).eq('deleted', false),
        supabase.from('questions').select('id', { count: 'exact', head: true })
          .eq('chapter_id', chapterId).eq('deleted', false),
        (supabase as any).from('classes').select('id, name, hidden').eq('hidden', false).order('id'),
      ]);
      setCounts({ resources: rc || 0, questions: qc || 0 });
      setClasses(((classRes.data as any[]) || []).map((c) => ({ id: c.id, name: c.name })));
    })();
  }, [open, chapterId, chapterName]);

  const loadSubjects = async (classId: number) => {
    if (subjectsByClass[classId]) return subjectsByClass[classId];
    const { data } = await (supabase as any)
      .from('subjects')
      .select('id, name, class_id, deleted')
      .eq('class_id', classId)
      .eq('deleted', false)
      .order('name');
    const list: SubjectRow[] = ((data as any[]) || []).map((s) => ({
      id: s.id, name: s.name, class_id: s.class_id,
    }));
    setSubjectsByClass((prev) => ({ ...prev, [classId]: list }));
    return list;
  };

  const loadChapterOptions = async (subjectId: number): Promise<{ id: number; name: string }[]> => {
    const { data } = await (supabase as any)
      .from('chapters')
      .select('id, name, deleted')
      .eq('subject_id', subjectId)
      .eq('deleted', false)
      .order('name');
    return ((data as any[]) || []).map((c) => ({ id: c.id, name: c.name }));
  };

  const updateRow = (key: string, patch: Partial<TargetRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const handleClassChange = async (key: string, classId: number) => {
    updateRow(key, { classId, subjectId: null, existingChapterId: null, options: [] });
    await loadSubjects(classId);
  };

  const handleSubjectChange = async (key: string, subjectId: number) => {
    updateRow(key, { subjectId, existingChapterId: null });
    const options = await loadChapterOptions(subjectId);
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        // Auto-match by exact (case-insensitive) name to source chapter name
        const match = options.find(
          (o) => o.name.trim().toLowerCase() === r.chapterName.trim().toLowerCase(),
        );
        return {
          ...r,
          options,
          existingChapterId: match ? match.id : null,
        };
      }),
    );
  };

  const handleShare = async () => {
    const valid = rows.filter(
      (r) => r.classId && r.subjectId && r.chapterName.trim().length > 0,
    );
    if (valid.length === 0) {
      toast.error('Pick at least one target class and subject');
      return;
    }
    if (!includeResources && !includeQuestions) {
      toast.error('Select resources or questions to share');
      return;
    }
    setBusy(true);
    try {
      // 1) Resolve each row to a chapter id (create if missing).
      const targets: number[] = [];
      let createdCount = 0;
      for (const r of valid) {
        if (r.existingChapterId) {
          if (r.existingChapterId !== chapterId) targets.push(r.existingChapterId);
          continue;
        }
        // Re-check existence by exact (case-insensitive) name in subject to avoid races
        const { data: existing } = await (supabase as any)
          .from('chapters')
          .select('id, name')
          .eq('subject_id', r.subjectId)
          .eq('deleted', false)
          .ilike('name', r.chapterName.trim());
        const hit = (existing as any[] | null)?.find(
          (c) => c.name.trim().toLowerCase() === r.chapterName.trim().toLowerCase(),
        );
        if (hit) {
          if (hit.id !== chapterId) targets.push(hit.id);
          continue;
        }
        const { data: created, error: cErr } = await (supabase as any)
          .from('chapters')
          .insert({
            name: r.chapterName.trim(),
            subject_id: r.subjectId,
            class_id: r.classId,
          })
          .select('id')
          .single();
        if (cErr) throw cErr;
        createdCount++;
        if (created.id !== chapterId) targets.push(created.id);
      }

      // Dedupe target ids
      const uniqueTargets = Array.from(new Set(targets));
      if (uniqueTargets.length === 0) {
        toast.error('All target chapters resolved to the current chapter');
        return;
      }

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
          const merged = Array.from(new Set([...(row.shared_with || []), ...uniqueTargets]));
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
          const merged = Array.from(new Set([...current, ...uniqueTargets]));
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
        `Shared into ${uniqueTargets.length} chapter${uniqueTargets.length > 1 ? 's' : ''}` +
          (createdCount ? ` (${createdCount} newly created)` : '') +
          `: ` +
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 size={18} /> Share chapter
          </DialogTitle>
          <DialogDescription>
            Adds <span className="font-medium text-foreground">{chapterName}</span>'s content
            into other classes/subjects. By default we'll reuse (or create) a chapter
            with the same name; you can edit the name or pick an existing chapter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Target classes &amp; subjects</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRows((prev) => [...prev, makeRow(chapterName)])}
                disabled={busy}
              >
                <Plus size={14} className="mr-1" /> Add target
              </Button>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {rows.map((r) => {
                const subjects = r.classId ? subjectsByClass[r.classId] || [] : [];
                return (
                  <div
                    key={r.key}
                    className="grid grid-cols-12 gap-2 items-start border rounded-md p-2"
                  >
                    <div className="col-span-3">
                      <Select
                        value={r.classId ? String(r.classId) : ''}
                        onValueChange={(v) => handleClassChange(r.key, Number(v))}
                        disabled={busy}
                      >
                        <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
                        <SelectContent>
                          {classes.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Select
                        value={r.subjectId ? String(r.subjectId) : ''}
                        onValueChange={(v) => handleSubjectChange(r.key, Number(v))}
                        disabled={busy || !r.classId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={r.classId ? 'Subject' : 'Pick class first'} />
                        </SelectTrigger>
                        <SelectContent>
                          {subjects.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-5 space-y-1">
                      <Input
                        value={r.chapterName}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((prev) =>
                            prev.map((x) => {
                              if (x.key !== r.key) return x;
                              const match = x.options.find(
                                (o) => o.name.trim().toLowerCase() === v.trim().toLowerCase(),
                              );
                              return {
                                ...x,
                                chapterName: v,
                                existingChapterId: match ? match.id : null,
                              };
                            }),
                          );
                        }}
                        placeholder="Chapter name"
                        disabled={busy}
                      />
                      {r.subjectId && (
                        <div className="text-[11px] text-muted-foreground">
                          {r.existingChapterId
                            ? 'Will reuse existing chapter with this name.'
                            : 'Will create a new chapter with this name.'}
                          {r.options.length > 0 && (
                            <details className="mt-0.5">
                              <summary className="cursor-pointer hover:text-foreground">
                                Or pick an existing chapter ({r.options.length})
                              </summary>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {r.options.map((o) => (
                                  <button
                                    key={o.id}
                                    type="button"
                                    onClick={() =>
                                      updateRow(r.key, {
                                        existingChapterId: o.id,
                                        chapterName: o.name,
                                      })
                                    }
                                    className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                                      r.existingChapterId === o.id
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-background hover:bg-muted'
                                    }`}
                                  >
                                    {o.name}
                                  </button>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                        disabled={busy || rows.length === 1}
                        aria-label="Remove target"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
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
          <Button onClick={handleShare} disabled={busy}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};