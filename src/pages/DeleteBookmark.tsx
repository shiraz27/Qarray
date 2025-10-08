import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function DeleteBookmark() {
  const navigate = useNavigate();

  useEffect(() => {
    const deleteBookmark = async () => {
      try {
        const { error } = await supabase
          .from('bookmarks')
          .delete()
          .eq('id', 'e52acab1-dedd-4f45-a887-243974937021');

        if (error) throw error;
        
        toast.success('Bookmark removed');
        navigate('/bookmarks');
      } catch (error) {
        console.error('Error deleting bookmark:', error);
        toast.error('Failed to delete bookmark');
        navigate('/bookmarks');
      }
    };

    deleteBookmark();
  }, [navigate]);

  return null;
}
