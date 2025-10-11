import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Brain, Lock, Globe, ThumbsUp, ThumbsDown, Bookmark, Edit, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { EditMemorizationDialog } from './EditMemorizationDialog';
import { useUserRole } from '@/hooks/useUserRole';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import chapterPattern from '@/assets/chapter-pattern.png';

interface Memorization {
  id: number;
  title: string;
  description: string | null;
  is_public: boolean;
  flashcard_count: number;
  creator_name: string;
  creator_id: string;
  upvotes: number;
  downvotes: number;
  isBookmarked: boolean;
  userVote: 'up' | 'down' | null;
}

interface MemorizationsListProps {
  subjectId: number | null;
}

export const MemorizationsList = ({ subjectId }: MemorizationsListProps) => {
  const [memorizations, setMemorizations] = useState<Memorization[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  const { isModerator, isAdmin } = useUserRole();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  useEffect(() => {
    const fetchMemorizations = async () => {
      if (!subjectId) return;

      setLoading(true);
      try {
        const { data: memData, error } = await supabase
          .from('memorizations')
          .select('id, title, description, is_public, creator_id, upvotes, downvotes')
          .eq('subject_id', subjectId)
          .eq('deleted', false)
          .order('upvotes', { ascending: false });

        if (error) throw error;

        // Get bookmarks and votes for user
        let bookmarkedIds: number[] = [];
        let userVotes: Record<number, 'up' | 'down'> = {};

        if (user) {
          const { data: bookmarksData } = await supabase
            .from('bookmarks')
            .select('content_id')
            .eq('user_id', user.id)
            .eq('content_type', 'memorization');
          bookmarkedIds = bookmarksData?.map(b => b.content_id) || [];

          const { data: votesData } = await supabase
            .from('votes')
            .select('content_id, vote_type')
            .eq('user_id', user.id)
            .eq('content_type', 'memorization');
          votesData?.forEach(v => {
            userVotes[v.content_id] = v.vote_type as 'up' | 'down';
          });
        }

        // Get flashcard counts and creator profiles
        const memorizationsWithCounts = await Promise.all(
          (memData || []).map(async (mem) => {
            const { count } = await supabase
              .from('flashcards')
              .select('*', { count: 'exact', head: true })
              .eq('memorization_id', mem.id)
              .eq('deleted', false);

            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('user_id', mem.creator_id)
              .maybeSingle();

            return {
              id: mem.id,
              title: mem.title,
              description: mem.description,
              is_public: mem.is_public,
              flashcard_count: count || 0,
              creator_name: profile?.full_name || 'Unknown',
              creator_id: mem.creator_id,
              upvotes: mem.upvotes || 0,
              downvotes: mem.downvotes || 0,
              isBookmarked: bookmarkedIds.includes(mem.id),
              userVote: userVotes[mem.id] || null,
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
  }, [subjectId, user]);

  const handleVote = async (memId: number, voteType: 'up' | 'down', currentVote: 'up' | 'down' | null) => {
    if (!user) {
      toast.error('Please login to vote');
      return;
    }

    try {
      if (currentVote === voteType) {
        // Remove vote
        await supabase
          .from('votes')
          .delete()
          .eq('user_id', user.id)
          .eq('content_id', memId)
          .eq('content_type', 'memorization');

        // Update count
        const field = voteType === 'up' ? 'upvotes' : 'downvotes';
        const { data: mem } = await supabase
          .from('memorizations')
          .select(field)
          .eq('id', memId)
          .single();
        
        await supabase
          .from('memorizations')
          .update({ [field]: Math.max(0, (mem?.[field] || 1) - 1) })
          .eq('id', memId);

        setMemorizations(prev => prev.map(m =>
          m.id === memId ? { ...m, [field]: Math.max(0, m[field] - 1), userVote: null } : m
        ));
      } else {
        // Add or change vote
        if (currentVote) {
          // Remove old vote
          await supabase
            .from('votes')
            .delete()
            .eq('user_id', user.id)
            .eq('content_id', memId)
            .eq('content_type', 'memorization');

          const oldField = currentVote === 'up' ? 'upvotes' : 'downvotes';
          const { data: mem } = await supabase
            .from('memorizations')
            .select(oldField)
            .eq('id', memId)
            .single();
          
          await supabase
            .from('memorizations')
            .update({ [oldField]: Math.max(0, (mem?.[oldField] || 1) - 1) })
            .eq('id', memId);
        }

        // Add new vote
        await supabase
          .from('votes')
          .insert({
            user_id: user.id,
            content_id: memId,
            content_type: 'memorization',
            vote_type: voteType,
          });

        const field = voteType === 'up' ? 'upvotes' : 'downvotes';
        const { data: mem } = await supabase
          .from('memorizations')
          .select(field)
          .eq('id', memId)
          .single();
        
        await supabase
          .from('memorizations')
          .update({ [field]: (mem?.[field] || 0) + 1 })
          .eq('id', memId);

        setMemorizations(prev => prev.map(m => {
          if (m.id === memId) {
            const updates: any = { userVote: voteType };
            if (currentVote) {
              const oldField = currentVote === 'up' ? 'upvotes' : 'downvotes';
              updates[oldField] = Math.max(0, m[oldField] - 1);
            }
            updates[field] = m[field] + 1;
            return { ...m, ...updates };
          }
          return m;
        }));
      }
    } catch (error) {
      console.error('Error voting:', error);
      toast.error('Failed to vote');
    }
  };

  const handleBookmark = async (memId: number, isBookmarked: boolean) => {
    if (!user) {
      toast.error('Please login to bookmark');
      return;
    }

    try {
      if (isBookmarked) {
        await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('content_id', memId)
          .eq('content_type', 'memorization');
        
        setMemorizations(prev => prev.map(m =>
          m.id === memId ? { ...m, isBookmarked: false } : m
        ));
        toast.success('Bookmark removed');
      } else {
        await supabase
          .from('bookmarks')
          .insert({
            user_id: user.id,
            content_id: memId,
            content_type: 'memorization',
          });
        
        setMemorizations(prev => prev.map(m =>
          m.id === memId ? { ...m, isBookmarked: true } : m
        ));
        toast.success('Bookmark added');
      }
    } catch (error) {
      console.error('Error bookmarking:', error);
      toast.error('Failed to update bookmark');
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      const { error } = await supabase
        .from('memorizations')
        .update({ deleted: true })
        .eq('id', deletingId);

      if (error) throw error;

      setMemorizations(prev => prev.filter(m => m.id !== deletingId));
      toast.success('Memorization deleted');
      setDeletingId(null);
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Failed to delete memorization');
    }
  };

  const canEdit = (mem: Memorization) => {
    return user && (mem.creator_id === user.id || isModerator || isAdmin);
  };

  if (!subjectId) return null;

  const displayedMems = isExpanded ? memorizations : memorizations.slice(0, 3);
  const hasMemorizations = memorizations.length > 0;

  return (
    <>
      <div className="w-full px-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="w-5 h-5" style={{ color: '#703627' }} />
            Memorization Sets
          </h3>
          {hasMemorizations && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="gap-1"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Show All ({memorizations.length})
                </>
              )}
            </Button>
          )}
        </div>
        
        {loading ? (
          <div className="text-center py-4 text-muted-foreground">Loading...</div>
        ) : !hasMemorizations ? (
          <Card className="p-8 text-center">
            <Brain className="w-12 h-12 mx-auto mb-3 text-muted-foreground" style={{ color: '#703627', opacity: 0.5 }} />
            <p className="text-muted-foreground">No memorization sets yet for this subject</p>
          </Card>
        ) : (
          <div className="space-y-3">
          {displayedMems.map((mem) => (
            <Card
              key={mem.id}
              className="relative overflow-hidden p-4 hover:shadow-md transition-all border-none"
              style={{
                background: 'linear-gradient(to right, #FFFFFF 0%, #F5E6D3 100%)',
              }}
            >
              {/* Pattern overlay */}
              <div 
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage: `url(${chapterPattern})`,
                  backgroundSize: 'auto',
                  backgroundRepeat: 'repeat',
                  imageRendering: 'crisp-edges',
                }}
              />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <h3
                    className="font-semibold text-sm tracking-wide text-foreground flex-1 cursor-pointer"
                    onClick={() => navigate(`/memorization/${mem.id}`)}
                  >
                    {mem.title.toUpperCase()}
                  </h3>
                  <div className="flex items-center gap-2">
                    {canEdit(mem) && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(mem.id);
                          }}
                          className="hover:scale-110 transition-transform"
                        >
                          <Edit size={18} className="text-foreground" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(mem.id);
                          }}
                          className="hover:scale-110 transition-transform"
                        >
                          <Trash2 size={18} className="text-destructive" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBookmark(mem.id, mem.isBookmarked);
                      }}
                      className="hover:scale-110 transition-transform"
                    >
                      <Bookmark
                        size={18}
                        className={`text-foreground ${mem.isBookmarked ? 'fill-foreground' : ''}`}
                      />
                    </button>
                  </div>
                </div>

                <div className="flex gap-4 text-xs items-center justify-between">
                  <div className="flex gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVote(mem.id, 'up', mem.userVote);
                      }}
                      className="flex items-center gap-1 hover:scale-110 transition-transform"
                    >
                      <ThumbsUp
                        size={14}
                        className={mem.userVote === 'up' ? 'fill-foreground text-foreground' : 'text-muted-foreground'}
                      />
                      <span className="font-medium text-muted-foreground">{mem.upvotes}</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVote(mem.id, 'down', mem.userVote);
                      }}
                      className="flex items-center gap-1 hover:scale-110 transition-transform"
                    >
                      <ThumbsDown
                        size={14}
                        className={mem.userVote === 'down' ? 'fill-foreground text-foreground' : 'text-muted-foreground'}
                      />
                      <span className="font-medium text-muted-foreground">{mem.downvotes}</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span className="font-medium">{mem.flashcard_count} cards</span>
                    <span className="text-xs">by {mem.creator_name}</span>
                  </div>
                </div>
              </div>
            </Card>
            ))}
          </div>
        )}
      </div>

      {editingId && (
        <EditMemorizationDialog
          open={!!editingId}
          onClose={() => setEditingId(null)}
          memorizationId={editingId}
          onSuccess={() => {
            setEditingId(null);
            // Refresh list
            window.location.reload();
          }}
        />
      )}

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Memorization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this memorization? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
