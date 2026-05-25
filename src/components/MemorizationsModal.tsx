import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { normalizedIncludes } from '@/utils/textHelpers';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Brain, BookOpen, Users, ArrowLeft, Play } from 'lucide-react';
import { toast } from 'sonner';
import { CreateMemorizationDialog } from './CreateMemorizationDialog';
import { StudySessionDialog } from './StudySessionDialog';
import { useSpacedRepetition } from '@/hooks/useSpacedRepetition';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

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

  const { enabled: featureEnabled, loading: featureLoading } = useFeatureFlag('memorizations');

  useEffect(() => {
    if (!open) return;
    if (featureLoading || featureEnabled === false) return;

    fetchMemorizations();
  }, [open, activeTab, subjectId, chapterId, featureLoading, featureEnabled]);

  // Hard stop network fetches + UI when disabled
  if (!open) return null;
  if (featureLoading || featureEnabled === false) return null;


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

          const { data: profile } = await (supabase as any)
            .from('public_profiles')
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

  const filteredMemorizations = memorizations.filter((m) =>
    normalizedIncludes(m.title, searchQuery),
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl h-[90vh] p-0 gap-0">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-background border-b p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
                  <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                </Button>
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <Brain className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
                  <h2 className="text-lg sm:text-2xl font-bold truncate">Memorizations</h2>
                </div>
              </div>
              <Button 
                onClick={() => setCreateDialogOpen(true)} 
                className="gap-1.5 sm:gap-2 text-xs sm:text-sm shrink-0"
                size="sm"
              >
                <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">Create New</span>
                <span className="xs:hidden">New</span>
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1.5 sm:gap-2 mb-3 sm:mb-4">
              <Button
                variant={activeTab === 'mine' ? 'default' : 'outline'}
                onClick={() => setActiveTab('mine')}
                className="flex-1 text-xs sm:text-sm px-2 sm:px-4"
                size="sm"
              >
                <BookOpen className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="hidden sm:inline">My Sets</span>
                <span className="sm:hidden ml-1">Mine</span>
              </Button>
              <Button
                variant={activeTab === 'subscribed' ? 'default' : 'outline'}
                onClick={() => setActiveTab('subscribed')}
                className="flex-1 text-xs sm:text-sm px-2 sm:px-4"
                size="sm"
              >
                <Users className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="hidden sm:inline">Subscribed</span>
                <span className="sm:hidden ml-1">Subs</span>
              </Button>
              <Button
                variant={activeTab === 'public' ? 'default' : 'outline'}
                onClick={() => setActiveTab('public')}
                className="flex-1 text-xs sm:text-sm px-2 sm:px-4"
                size="sm"
              >
                <Brain className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="ml-1">Public</span>
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
    <Card className="p-3 sm:p-4 hover:shadow-lg transition-all">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base sm:text-lg mb-1 break-words">{memorization.title}</h3>
          {memorization.description && (
            <p className="text-xs sm:text-sm text-muted-foreground mb-2 break-words">{memorization.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
            <span>{memorization.flashcards_count || 0} cards</span>
            {dueReviews > 0 && (
              <span className="text-primary font-medium">{dueReviews} due</span>
            )}
            {!isOwner && memorization.profiles && (
              <span className="truncate">by {memorization.profiles.full_name}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2 shrink-0 sm:flex-col sm:w-auto w-full">
          <Button onClick={onStudy} className="gap-1.5 sm:gap-2 flex-1 sm:flex-initial text-xs sm:text-sm" size="sm">
            <Play className="w-3 h-3 sm:w-4 sm:h-4" />
            <span>Study</span>
          </Button>
          {!isOwner && (
            <Button
              variant={memorization.is_subscribed ? 'secondary' : 'outline'}
              onClick={() => onSubscribe(memorization.id, memorization.is_subscribed || false)}
              className="flex-1 sm:flex-initial text-xs sm:text-sm whitespace-nowrap"
              size="sm"
            >
              {memorization.is_subscribed ? 'Subscribed' : 'Subscribe'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
