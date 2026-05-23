import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SharedWithSummary {
  classes: { id: number; name: string }[];
  subjects: { id: number; name: string }[];
  chapters: { id: number; name: string }[];
  destinations: {
    chapterId: number;
    chapterName: string;
    classId: number | null;
    className: string;
    subjectId: number | null;
    subjectName: string;
  }[];
  loading: boolean;
}

const EMPTY: SharedWithSummary = { classes: [], subjects: [], chapters: [], destinations: [], loading: false };

/**
 * Given a list of chapter ids (resource.shared_with), resolve the distinct
 * destination classes and subjects for the small "Shared with" badge.
 */
export function useSharedWithSummary(sharedWithIds: number[] | null | undefined): SharedWithSummary {
  const [state, setState] = useState<SharedWithSummary>(EMPTY);
  const key = (sharedWithIds || []).slice().sort((a, b) => a - b).join(',');

  useEffect(() => {
    if (!sharedWithIds || sharedWithIds.length === 0) {
      setState(EMPTY);
      return;
    }
    const ids = Array.from(new Set(sharedWithIds.filter((id) => Number.isFinite(id))));
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const { data: chapterRows } = await (supabase as any)
        .from('chapters')
        .select('id, name, class_id, subject_id')
        .in('id', ids);
      if (cancelled) return;

      const rows = (chapterRows as any[] | null) || [];
      const classIds = Array.from(new Set(rows.map((c) => c.class_id).filter(Boolean)));
      const subjectIds = Array.from(new Set(rows.map((c) => c.subject_id).filter(Boolean)));

      const [{ data: classRows }, { data: subjectRows }] = await Promise.all([
        classIds.length
          ? (supabase as any).from('classes').select('id, name').in('id', classIds)
          : Promise.resolve({ data: [] }),
        subjectIds.length
          ? (supabase as any).from('subjects').select('id, name').in('id', subjectIds)
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;

      const classNames = new Map<number, string>(((classRows as any[] | null) || []).map((c) => [c.id, c.name]));
      const subjectNames = new Map<number, string>(((subjectRows as any[] | null) || []).map((s) => [s.id, s.name]));
      const classMap = new Map<number, string>();
      const subjectMap = new Map<number, string>();
      const chapterMap = new Map<number, string>();
      for (const c of rows) {
        if (c.class_id) classMap.set(c.class_id, classNames.get(c.class_id) ?? `Class #${c.class_id}`);
        if (c.subject_id) subjectMap.set(c.subject_id, subjectNames.get(c.subject_id) ?? `Subject #${c.subject_id}`);
        if (c.id) chapterMap.set(c.id, c.name ?? `Chapter #${c.id}`);
      }
      const byChapterId = new Map(rows.map((c) => [c.id, c]));
      setState({
        classes: Array.from(classMap, ([id, name]) => ({ id, name })),
        subjects: Array.from(subjectMap, ([id, name]) => ({ id, name })),
        chapters: Array.from(chapterMap, ([id, name]) => ({ id, name })),
        destinations: ids
          .map((id) => byChapterId.get(id))
          .filter(Boolean)
          .map((c) => ({
            chapterId: c.id,
            chapterName: c.name ?? `Chapter #${c.id}`,
            classId: c.class_id ?? null,
            className: c.class_id ? classNames.get(c.class_id) ?? `Class #${c.class_id}` : 'Unknown class',
            subjectId: c.subject_id ?? null,
            subjectName: c.subject_id ? subjectNames.get(c.subject_id) ?? `Subject #${c.subject_id}` : 'Unknown subject',
          })),
        loading: false,
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}