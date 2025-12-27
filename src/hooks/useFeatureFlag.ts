import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface FeatureFlag {
  id: string;
  enabled: boolean;
  description: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export function useFeatureFlag(flagId: string) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFlag = async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('enabled')
        .eq('id', flagId)
        .single();

      if (!error && data) {
        setEnabled(data.enabled);
      } else {
        // Default to enabled if flag doesn't exist
        setEnabled(true);
      }
      setLoading(false);
    };

    fetchFlag();
  }, [flagId]);

  return { enabled, loading };
}

export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFlags = async () => {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('*')
      .order('id');

    if (!error && data) {
      setFlags(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFlags();
  }, []);

  const updateFlag = async (flagId: string, enabled: boolean) => {
    const { data: userData } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('feature_flags')
      .update({ 
        enabled, 
        updated_at: new Date().toISOString(),
        updated_by: userData?.user?.id || null
      })
      .eq('id', flagId);

    if (!error) {
      setFlags(prev => prev.map(f => 
        f.id === flagId 
          ? { ...f, enabled, updated_at: new Date().toISOString(), updated_by: userData?.user?.id || null }
          : f
      ));
      return true;
    }
    return false;
  };

  return { flags, loading, updateFlag, refetch: fetchFlags };
}
