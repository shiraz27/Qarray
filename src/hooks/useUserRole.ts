import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useUserRole() {
  const [isModerator, setIsModerator] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUserRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (roles) {
        const userRoles = roles.map(r => r.role);
        setIsAdmin(userRoles.includes('admin'));
        setIsModerator(userRoles.includes('moderator') || userRoles.includes('admin'));
      }

      setLoading(false);
    };

    checkUserRole();
  }, []);

  return { isModerator, isAdmin, loading };
}
