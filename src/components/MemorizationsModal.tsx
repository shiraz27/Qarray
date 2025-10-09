import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Brain, BookOpen, Users, ArrowLeft, Play } from 'lucide-react';
import { toast } from 'sonner';
import { CreateMemorizationDialog } from './CreateMemorizationDialog';
import { StudySessionDialog } from './StudySessionDialog';
import { useSpacedRepetition } from '@/hooks/useSpacedRepetition';

interface MemorizationsModalProps {
  open: boolean;
  onClose: () => void;
  subjectId?: number;
  chapterId?: number;
}

interface Memorization {
  id: number;
  title: string;
  description: string;
  creator_id: string;
  is_public: boolean;
  created_at: string;
  flashcards_count?: number;
  is_subscribed?: boolean;
  profiles?: { full_name: string; avatar_color: string };
}

export const MemorizationsModal = ({ open, onClose, subjectId, chapterId }: MemorizationsModalProps) => {
  const [memorizations, setMemorizations] = useState<Memorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [studyMemorizationId, setStudyMemorizationId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'mine' | 'subscribed' | 'public'>('mine');

  useEffect(() => {
    if (open) {
      fetchMemorizations();
    }
  }, [open, activeTab, subjectId, chapterId]);

  const fetchMemorizations = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from('memorizations')
        .select('*')
        .eq('deleted', false)
        .order('created_at', { ascending: false });

      if (activeTab === 'mine') {
        query = query.eq('creator_id', user.id);
      } else if (activeTab === 'public') {
        query = query.eq('is_public', true);
      }

      if (subjectId) {
        query = query.eq('subject_id', subjectId);
      }
      if (chapterId) {
        query = query.eq('chapter_id', chapterId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get flashcard counts, subscription status, and creator info
      const memorizationsWithCounts = await Promise.all(
        (data || []).map(async (mem) => {
          const { count } = await supabase
            .from('flashcards')
            .select('*', { count: 'exact', head: true })
            .eq('memorization_id', mem.id)
            .eq('deleted', false);

          const { data: subscription } = await supabase
            .from('memorization_subscriptions')
            .select('id')
            .eq('user_id', user.id)
            .eq('memorization_id', mem.id)
            .maybeSingle();

          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, avatar_color')
            .eq('user_id', mem.creator_id)
            .maybeSingle();

          return {
            ...mem,
            flashcards_count: count || 0,
            is_subscribed: !!subscription,
            profiles: profile || undefined,
          };
        })
      );

      // Filter by subscribed if needed
      let filteredMems = memorizationsWithCounts;
      if (activeTab === 'subscribed') {
        filteredMems = memorizationsWithCounts.filter(m => m.is_subscribed);
      }

      setMemorizations(filteredMems);
    } catch (error: any) {
      console.error('Error fetching memorizations:', error);
      toast.error('Failed to load memorizations');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (memorizationId: number, isSubscribed: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (isSubscribed) {
        await supabase
          .from('memorization_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('memorization_id', memorizationId);
        toast.success('Unsubscribed from memorization');
      } else {
        await supabase
          .from('memorization_subscriptions')
          .insert({ user_id: user.id, memorization_id: memorizationId });
        toast.success('Subscribed to memorization');
      }

      fetchMemorizations();
    } catch (error: any) {
      console.error('Error toggling subscription:', error);
      toast.error('Failed to update subscription');
    }
  };

  const filteredMemorizations = memorizations.filter(m =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl h-[90vh] p-0 gap-0">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background border-b p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="flex items-center gap-2">
                  <Brain className="w-6 h-6 text-primary" />
                  <h2 className="text-2xl font-bold">Memorizations</h2>
                </div>
              </div>
              <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Create New
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              <Button
                variant={activeTab === 'mine' ? 'default' : 'outline'}
                onClick={() => setActiveTab('mine')}
                className="flex-1"
              >
                <BookOpen className="w-4 h-4 mr-2" />
                My Sets
              </Button>
              <Button
                variant={activeTab === 'subscribed' ? 'default' : 'outline'}
                onClick={() => setActiveTab('subscribed')}
                className="flex-1"
              >
                <Users className="w-4 h-4 mr-2" />
                Subscribed
              </Button>
              <Button
                variant={activeTab === 'public' ? 'default' : 'outline'}
                onClick={() => setActiveTab('public')}
                className="flex-1"
              >
                <Brain className="w-4 h-4 mr-2" />
                Public
              </Button>
            </div>

            {/* Search */}
            <Input
              placeholder="Search memorizations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : filteredMemorizations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No memorizations found
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredMemorizations.map((memorization) => (
                  <MemorizationCard
                    key={memorization.id}
                    memorization={memorization}
                    onStudy={() => setStudyMemorizationId(memorization.id)}
                    onSubscribe={handleSubscribe}
                    onRefresh={fetchMemorizations}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CreateMemorizationDialog
        open={createDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false);
          fetchMemorizations();
        }}
        subjectId={subjectId}
        chapterId={chapterId}
      />

      {studyMemorizationId && (
        <StudySessionDialog
          memorizationId={studyMemorizationId}
          onClose={() => setStudyMemorizationId(null)}
        />
      )}
    </>
  );
};

interface MemorizationCardProps {
  memorization: Memorization;
  onStudy: () => void;
  onSubscribe: (id: number, isSubscribed: boolean) => void;
  onRefresh: () => void;
}

const MemorizationCard = ({ memorization, onStudy, onSubscribe, onRefresh }: MemorizationCardProps) => {
  const { dueReviews } = useSpacedRepetition(memorization.id);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const isOwner = user?.id === memorization.creator_id;

  return (
    <Card className="p-4 hover:shadow-lg transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-bold text-lg mb-1">{memorization.title}</h3>
          {memorization.description && (
            <p className="text-sm text-muted-foreground mb-2">{memorization.description}</p>
          )}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{memorization.flashcards_count || 0} cards</span>
            {dueReviews > 0 && (
              <span className="text-primary font-medium">{dueReviews} due for review</span>
            )}
            {!isOwner && memorization.profiles && (
              <span>by {memorization.profiles.full_name}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={onStudy} className="gap-2">
            <Play className="w-4 h-4" />
            Study
          </Button>
          {!isOwner && (
            <Button
              variant={memorization.is_subscribed ? 'secondary' : 'outline'}
              onClick={() => onSubscribe(memorization.id, memorization.is_subscribed || false)}
            >
              {memorization.is_subscribed ? 'Subscribed' : 'Subscribe'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
