import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { resourceChapterFilter } from '@/utils/resourceChapterFilter';

type SubjectRow = { id: number; name: string; logo: string | null; class_id?: number | null };

export type ChapterWithCounts = {
  id: number;
  name: string;
  questionCount: number;
  answerCount: number;
  resourceCount: number;
  pageCount: number;
  isBookmarked: boolean;
};

export type CommonChapter = {
  id: number;
  name: string;
  className: string;
  matchedNativeId: number | null;
  questionCount: number;
  answerCount: number;
  resourceCount: number;
  pageCount: number;
};

type SubjectsCacheEntry = { data: SubjectRow[] | null; loaded: boolean; loading: boolean; error?: unknown };

type ChaptersCacheEntry = {
  data: {
    chapters: ChapterWithCounts[];
    commonChapters: CommonChapter[];
    classId: number | null;
  } | null;
  loaded: boolean;
  loading: boolean;
  error?: unknown;
};

type LibraryDataContextType = {
  // Subjects
  ensureSubjects: (classId: number | null | undefined) => Promise<SubjectRow[]>;
  invalidateSubjects: (classId: number | null | undefined) => void;

  // Chapters
  ensureChapters: (
    subjectId: number,
    viewingClassId?: number | null
  ) => Promise<{
    chapters: ChapterWithCounts[];
    commonChapters: CommonChapter[];
    classId: number | null;
  }>;
  invalidateChapters: (subjectId: number) => void;

  // Convenience caches
  getSubjectsFromCache: (classId: number | null | undefined) => SubjectRow[] | null;
  getChaptersFromCache: (
    subjectId: number,
    viewingClassId?: number | null
  ) => { chapters: ChapterWithCounts[]; commonChapters: CommonChapter[]; classId: number | null } | null;
};

const LibraryDataContext = createContext<LibraryDataContextType | null>(null);

const BAC_CLASS_IDS = new Set([15, 16, 17, 18, 19, 20, 21]);

function stableKey(...parts: Array<string | number | null | undefined>) {
  return parts.map(p => (p === null || p === undefined ? 'null' : String(p))).join(':');
}

export const useLibraryData = () => {
  const ctx = useContext(LibraryDataContext);
  if (!ctx) throw new Error('useLibraryData must be used within LibraryDataProvider');
  return ctx;
};

export const LibraryDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const subjectsCacheRef = useRef<Map<string, SubjectsCacheEntry>>(new Map());
  const chaptersCacheRef = useRef<Map<string, ChaptersCacheEntry>>(new Map());

  // We use state only to force re-render for consumers when a key transitions.
  const [, forceRender] = useState(0);

  const bump = useCallback(() => forceRender(v => v + 1), []);

  const getSubjectsFromCache = useCallback((classId: number | null | undefined) => {
    if (!classId) return null;
    const key = stableKey('subjects', classId);
    return subjectsCacheRef.current.get(key)?.data ?? null;
  }, []);

  const invalidateSubjects = useCallback((classId: number | null | undefined) => {
    if (!classId) return;
    const key = stableKey('subjects', classId);
    subjectsCacheRef.current.delete(key);
    bump();
  }, [bump]);

  const ensureSubjects = useCallback(async (classId: number | null | undefined) => {
    if (!classId) return [];

    const key = stableKey('subjects', classId);
    const existing = subjectsCacheRef.current.get(key);
    if (existing?.loaded && existing.data) return existing.data;
    if (existing?.loading && existing.data) return existing.data;
    if (existing?.loading) {
      // Still loading; wait by polling minimal.
      while (true) {
        const cur = subjectsCacheRef.current.get(key);
        if (!cur?.loading) {
          return cur?.data ?? [];
        }
        await new Promise(r => setTimeout(r, 50));
      }
    }

    subjectsCacheRef.current.set(key, { data: null, loaded: false, loading: true });
    bump();

    try {
      const [primaryRes, commonRes] = await Promise.all([
        supabase
          .from('subjects')
          .select('id, name, logo, class_id')
          .eq('class_id', classId)
          .eq('deleted', false)
          .order('name'),
        supabase
          .from('subjects')
          .select('id, name, logo, class_id')
          .contains('common', [classId])
          .eq('deleted', false)
          .order('name'),
      ]);

      if (primaryRes.error) throw primaryRes.error;
      if (commonRes.error) throw commonRes.error;

      const primary = primaryRes.data || [];
      const common = (commonRes.data || []).filter((c: SubjectRow) => !primary.find((p: SubjectRow) => p.id === c.id));
      const data = [...primary, ...common];

      subjectsCacheRef.current.set(key, { data, loaded: true, loading: false });
      bump();
      return data;
    } catch (err) {
      subjectsCacheRef.current.set(key, { data: null, loaded: false, loading: false, error: err });
      bump();
      throw err;
    }
  }, [bump]);

  const getChaptersFromCache = useCallback(
    (subjectId: number, viewingClassId?: number | null) => {
      const key = stableKey('chapters', subjectId, viewingClassId ?? 'null');
      return chaptersCacheRef.current.get(key)?.data ?? null;
    },
    []
  );

  const invalidateChapters = useCallback((subjectId: number) => {
    // Invalidate all viewingClassId variants for this subjectId.
    for (const key of chaptersCacheRef.current.keys()) {
      if (key.startsWith(`chapters:${subjectId}:`) || key === `chapters:${subjectId}`) {
        chaptersCacheRef.current.delete(key);
      }
    }
    bump();
  }, [bump]);

  const ensureChapters = useCallback(
    async (subjectId: number, viewingClassId?: number | null) => {
      const key = stableKey('chapters', subjectId, viewingClassId ?? 'null');
      const existing = chaptersCacheRef.current.get(key);
      if (existing?.loaded && existing.data) return existing.data;
      if (existing?.loading && existing.data) return existing.data;
      if (existing?.loading) {
        while (true) {
          const cur = chaptersCacheRef.current.get(key);
          if (!cur?.loading) {
            return cur?.data ?? { chapters: [], commonChapters: [], classId: null };
          }
          await new Promise(r => setTimeout(r, 50));
        }
      }

      chaptersCacheRef.current.set(key, { data: null, loaded: false, loading: true });
      bump();

      try {
        // Get user for bookmarks
        const { data: auth } = await supabase.auth.getUser();
        const user = auth.user;

        // Fetch subject to get class_id
        const { data: subjectData } = await supabase
          .from('subjects')
          .select('class_id')
          .eq('id', subjectId)
          .maybeSingle();

        const effectiveClassId = subjectData?.class_id ?? viewingClassId ?? null;

        // Fetch chapters
        const { data: chaptersData, error: chaptersError } = await supabase
          .from('chapters')
          .select('id, name')
          .eq('subject_id', subjectId)
          .eq('deleted', false)
          .order('id', { ascending: true });
        if (chaptersError) throw chaptersError;

        // Fetch user's bookmarked chapters if logged in
        // NOTE: `bookmarks` is polymorphic across the app (content_type/content_id).
        let bookmarkedChapterIds: number[] = [];
        if (user) {
          const { data: bookmarksData, error: bookmarksError } = await supabase
            .from('bookmarks')
            .select('content_id')
            .eq('user_id', user.id)
            .eq('content_type', 'chapter');

          if (bookmarksError) throw bookmarksError;

          bookmarkedChapterIds = (bookmarksData || [])
            .map((b: { content_id: number }) => b.content_id);
        }



        // NOTE: Keeping existing logic (counts + page_count) but caching the final result.
        const chaptersWithCounts: ChapterWithCounts[] = await Promise.all(
          (chaptersData || []).map(async (chapter: { id: number; name: string }) => {
            const { count: questionCount } = await supabase
              .from('questions')
              .select('*', { count: 'exact', head: true })
              .eq('chapter_id', chapter.id)
              .eq('deleted', false);

            // answers count via question ids
            const qIds = await supabase
              .from('questions')
              .select('id')
              .eq('chapter_id', chapter.id)
              .eq('deleted', false)
              .then(res => (res.data?.map((q: { id: number }) => q.id) || []) as number[]);

            const { count: answerCount } = await supabase
              .from('answers')
              .select('*', { count: 'exact', head: true })
              .in('question_id', qIds)
              .eq('deleted', false);

            const { count: resourceCount } = await supabase
              .from('resources')
              .select('*', { count: 'exact', head: true })
              .or(resourceChapterFilter(chapter.id))
              .eq('deleted', false);

            const [{ data: resPages }, { data: qPages }] = await Promise.all([
              supabase
                .from('resources')
                .select('page_count')
                .or(resourceChapterFilter(chapter.id))
                .eq('deleted', false),
              supabase
                .from('questions')
                .select('page_count')
                .eq('chapter_id', chapter.id)
                .eq('deleted', false),
            ]);

            const pageCount =
              (resPages || []).reduce(
                (s: number, r: { page_count: number | null }) => s + (r.page_count || 0),
                0
              ) +
              (qPages || []).reduce(
                (s: number, r: { page_count: number | null }) => s + (r.page_count || 0),
                0
              );

            return {
              id: chapter.id,
              name: chapter.name,
              questionCount: questionCount || 0,
              answerCount: answerCount || 0,
              resourceCount: resourceCount || 0,
              pageCount,
              isBookmarked: bookmarkedChapterIds.includes(chapter.id),
            };
          })
        );

        const sortedChapters = [...chaptersWithCounts].sort((a, b) => {
          const aGen = a.name.trim().toLowerCase() === 'chapitre général' ? 0 : 1;
          const bGen = b.name.trim().toLowerCase() === 'chapitre général' ? 0 : 1;
          return aGen - bGen;
        });

        // Fetch common chapters from other Bac classes
        const currentClassId = subjectData?.class_id;
        const nativeIds = (chaptersData || []).map((c: { id: number }) => c.id);
        let commonChapters: CommonChapter[] = [];

        if (currentClassId && BAC_CLASS_IDS.has(currentClassId) && nativeIds.length > 0) {
          const { data: rawMappings } = await supabase
            .from('chapter_common_mappings')
            .select('chapter_id, common_chapter_id')
            .in('chapter_id', nativeIds);

          const commonToNative = new Map<number, number>();
          (rawMappings || []).forEach((r: { chapter_id: number; common_chapter_id: number }) => {
            const existing = commonToNative.get(r.common_chapter_id);
            if (existing === undefined || r.chapter_id < existing) {
              commonToNative.set(r.common_chapter_id, r.chapter_id);
            }
          });

          const targetIds = Array.from(commonToNative.keys());
          if (targetIds.length > 0) {
            const { data: chRows } = await supabase
              .from('chapters')
              .select('id, name, class_id, deleted, classes(name)')
              .in('id', targetIds)
              .eq('deleted', false);

            const nativeOrder = new Map<number, number>();
            (chaptersData || []).forEach((c: { id: number }, idx: number) => nativeOrder.set(c.id, idx));

            commonChapters = await Promise.all(
              (chRows || []).map(async (ch: { id: number; name: string; class_id?: number | null; classes?: { name: string } | null }) => {
                const { count: questionCount } = await supabase
                  .from('questions')
                  .select('*', { count: 'exact', head: true })
                  .eq('chapter_id', ch.id)
                  .eq('deleted', false);

                const qIds = await supabase
                  .from('questions')
                  .select('id')
                  .eq('chapter_id', ch.id)
                  .eq('deleted', false)
.then((res) => res.data?.map((q: { id: number }) => q.id) || []);

                const { count: answerCount } = await supabase
                  .from('answers')
                  .select('*', { count: 'exact', head: true })
                  .in('question_id', qIds)
                  .eq('deleted', false);

                const { count: resourceCount } = await supabase
                  .from('resources')
                  .select('*', { count: 'exact', head: true })
                  .or(resourceChapterFilter(ch.id))
                  .eq('deleted', false);

                const [{ data: resPages }, { data: qPages }] = await Promise.all([
                  supabase
                    .from('resources')
                    .select('page_count')
                    .or(resourceChapterFilter(ch.id))
                    .eq('deleted', false),
                  supabase
                    .from('questions')
                    .select('page_count')
                    .eq('chapter_id', ch.id)
                    .eq('deleted', false),
                ]);

                const pageCount =
(resPages || []).reduce((s: number, r: { page_count: number | null }) => s + (r.page_count || 0), 0) +
                  (qPages || []).reduce((s: number, r: { page_count: number | null }) => s + (r.page_count || 0), 0);

                return {
                  id: ch.id,
                  name: ch.name,
                  className: ch.classes?.name ?? '',
                  matchedNativeId: commonToNative.get(ch.id) ?? null,
                  questionCount: questionCount || 0,
                  answerCount: answerCount || 0,
                  resourceCount: resourceCount || 0,
                  pageCount,
                };
              })
            );

            commonChapters.sort((a, b) => {
              const aOrder = a.matchedNativeId !== null
                ? nativeOrder.get(a.matchedNativeId) ?? Number.MAX_SAFE_INTEGER
                : Number.MAX_SAFE_INTEGER;
              const bOrder = b.matchedNativeId !== null
                ? nativeOrder.get(b.matchedNativeId) ?? Number.MAX_SAFE_INTEGER
                : Number.MAX_SAFE_INTEGER;
              if (aOrder !== bOrder) return aOrder - bOrder;
              return a.id - b.id;
            });
          }
        }

        const finalData = {
          chapters: sortedChapters,
          commonChapters,
          classId: effectiveClassId,
        };

        chaptersCacheRef.current.set(key, { data: finalData, loaded: true, loading: false });
        bump();
        return finalData;
      } catch (err) {
        chaptersCacheRef.current.set(key, { data: null, loaded: false, loading: false, error: err });
        bump();
        throw err;
      }
    },
    [bump]
  );

  const value = useMemo<LibraryDataContextType>(
    () => ({
      ensureSubjects,
      invalidateSubjects,
      ensureChapters,
      invalidateChapters,
      getSubjectsFromCache,
      getChaptersFromCache,
    }),
    [ensureSubjects, invalidateSubjects, ensureChapters, invalidateChapters, getSubjectsFromCache, getChaptersFromCache]
  );

  return <LibraryDataContext.Provider value={value}>{children}</LibraryDataContext.Provider>;
};

