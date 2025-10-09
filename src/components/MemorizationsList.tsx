import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Brain, Lock, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Memorization {
  id: number;
  title: string;
  description: string | null;
  is_public: boolean;
  flashcard_count: number;
  creator_name: string;
}

interface MemorizationsListProps {
  subjectId: number | null;
}

export const MemorizationsList = ({ subjectId }: MemorizationsListProps) => {
  const [memorizations, setMemorizations] = useState<Memorization[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMemorizations = async () => {
      if (!subjectId) return;

      setLoading(true);
      try {
        const { data: memData, error } = await supabase
          .from('memorizations')
          .select(`
            id,
            title,
            description,
            is_public,
            creator_id,
            profiles!memorizations_creator_id_fkey(full_name)
          `)
          .eq('subject_id', subjectId)
          .eq('deleted', false)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Get flashcard counts
        const memorizationsWithCounts = await Promise.all(
          (memData || []).map(async (mem) => {
            const { count } = await supabase
              .from('flashcards')
              .select('*', { count: 'exact', head: true })
              .eq('memorization_id', mem.id)
              .eq('deleted', false);

            return {
              id: mem.id,
              title: mem.title,
              description: mem.description,
              is_public: mem.is_public,
              flashcard_count: count || 0,
              creator_name: (mem.profiles as any)?.full_name || 'Unknown',
            };
          })
        );

        setMemorizations(memorizationsWithCounts);
      } catch (error) {
        console.error('Error fetching memorizations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMemorizations();
  }, [subjectId]);

  if (!subjectId || loading) return null;

  if (memorizations.length === 0) return null;

  return (
    <div className="w-full px-4 pb-4">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Brain className="w-5 h-5" style={{ color: '#703627' }} />
        Memorization Sets
      </h3>
      <div className="space-y-2">
        {memorizations.map((mem) => (
          <Card
            key={mem.id}
            className="p-4 hover:shadow-md transition-all cursor-pointer bg-gradient-to-r from-white to-[#F5E6D3]"
            onClick={() => navigate(`/memorization/${mem.id}`)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-sm">{mem.title}</h4>
                  {mem.is_public ? (
                    <Globe className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                {mem.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {mem.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{mem.flashcard_count} cards</span>
              <span>by {mem.creator_name}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
