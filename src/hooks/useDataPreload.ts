import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Cache for preloaded data
const cache = {
  resourceTypes: null as any[] | null,
  devoirTypes: null as any[] | null,
  subjects: null as any[] | null,
};

export const useDataPreload = () => {
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

          if (profile?.class_id && !cache.subjects) {
            const { data: subjects } = await supabase
              .from('subjects')
              .select('*')
              .or(`class_id.eq.${profile.class_id},common.cs.{${profile.class_id}}`)
              .eq('deleted', false)
              .order('name');
            cache.subjects = subjects || [];
          }
        }
      } catch (error) {
        console.error('Error preloading data:', error);
      }
    };

    preloadData();
  }, []);

  return cache;
};

export const getCachedData = () => cache;
