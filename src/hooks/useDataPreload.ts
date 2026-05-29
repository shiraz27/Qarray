import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLibraryData } from '@/contexts/LibraryDataContext';
import { readLastSubject } from '@/utils/lastSubjectStorage';

// Cache for preloaded data
const cache = {
  resourceTypes: null as any[] | null,
  devoirTypes: null as any[] | null,
  subjects: null as any[] | null,
};

export const useDataPreload = () => {
  const { ensureSubjects, ensureChapters } = useLibraryData();

  useEffect(() => {
    const preloadData = async () => {
      try {
        // Preload resource types
        if (!cache.resourceTypes) {
          const { data: types } = await supabase
            .from('resource_types')
            .select('*')
            .order('id');
          cache.resourceTypes = types || [];
        }

        // Preload devoir types
        if (!cache.devoirTypes) {
          const { data: devoirTypes } = await supabase
            .from('devoir_types')
            .select('*')
            .order('id');
          cache.devoirTypes = devoirTypes || [];
        }

        // Preload user profile and subjects
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('class_id')
            .eq('user_id', user.id)
            .single();

          if (profile?.class_id) {
            // Use shared LibraryData cache so SubjectTabs hits the same entry.
            const subjects = await ensureSubjects(profile.class_id);
            cache.subjects = subjects;

            // Warm chapters for the user's last-selected subject (or first).
            if (subjects.length > 0) {
              const stored = readLastSubject(profile.class_id);
              const preferred =
                stored && subjects.find((s) => s.id === stored)
                  ? stored
                  : subjects[0].id;
              // Fire-and-forget; result is cached for instant render.
              void ensureChapters(preferred, profile.class_id).catch(() => {});
            }
          }
        }
      } catch (error) {
        console.error('Error preloading data:', error);
      }
    };

    preloadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return cache;
};

export const getCachedData = () => cache;
