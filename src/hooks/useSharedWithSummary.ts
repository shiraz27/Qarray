import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SharedWithSummary {
  classes: { id: number; name: string }[];
  subjects: { id: number; name: string }[];
  chapters: { id: number; name: string }[];
  loading: boolean;
}

const EMPTY: SharedWithSummary = { classes: [], subjects: [], chapters: [], loading: false };

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
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const { data } = await (supabase as any)
        .from('chapters')
        .select('id, name, class_id, subject_id, subjects(id, name), classes:class_id(id, name)')
        .in('id', sharedWithIds);
      if (cancelled) return;
      const classMap = new Map<number, string>();
      const subjectMap = new Map<number, string>();
      const chapterMap = new Map<number, string>();
      for (const c of (data as any[] | null) || []) {
        const cls = c.classes;
        const subj = c.subjects;
        if (cls?.id) classMap.set(cls.id, cls.name);
        else if (c.class_id) classMap.set(c.class_id, `Class #${c.class_id}`);
        if (subj?.id) subjectMap.set(subj.id, subj.name);
        if (c.id) chapterMap.set(c.id, c.name ?? `Chapter #${c.id}`);
      }
      setState({
        classes: Array.from(classMap, ([id, name]) => ({ id, name })),
        subjects: Array.from(subjectMap, ([id, name]) => ({ id, name })),
        chapters: Array.from(chapterMap, ([id, name]) => ({ id, name })),
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