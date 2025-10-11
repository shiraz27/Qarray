import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Play, Edit, Trash2, BookmarkPlus, Bookmark as BookmarkIcon } from 'lucide-react';
import { BottomNavigation } from '@/components/BottomNavigation';
import { StudySessionDialog } from '@/components/StudySessionDialog';
import { EditMemorizationDialog } from '@/components/EditMemorizationDialog';
import { MediaPreview } from '@/components/MediaPreview';
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

interface Flashcard {
  id: number;
  front_data: { text: string; media?: string[] };
  back_data: { text: string; media?: string[] };
  order_index: number;
}

interface Memorization {
  id: number;
  title: string;
  description: string | null;
  creator_id: string;
  is_public: boolean;
  verified: boolean;
  created_at: string;
}

export default function MemorizationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isModerator, isAdmin } = useUserRole();
  const [memorization, setMemorization] = useState<Memorization | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [studyDialogOpen, setStudyDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [creatorName, setCreatorName] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (!user) {
        navigate('/login');
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (id && user) {
      fetchMemorization();
      fetchFlashcards();
      checkBookmark();
    }
  }, [id, user]);

  const fetchMemorization = async () => {
    try {
      const { data, error } = await supabase
        .from('memorizations')
        .select('*')
        .eq('id', parseInt(id!))
        .eq('deleted', false)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error('Memorization not found');
        navigate('/');
        return;
      }

      setMemorization(data);

      // Fetch creator name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', data.creator_id)
        .maybeSingle();

      setCreatorName(profile?.full_name || 'Unknown');
    } catch (error: any) {
      console.error('Error fetching memorization:', error);
      toast.error('Failed to load memorization');
      navigate('/');
    }
  };

  const fetchFlashcards = async () => {
    try {
      const { data, error } = await supabase
        .from('flashcards')
        .select('*')
        .eq('memorization_id', parseInt(id!))
        .eq('deleted', false)
        .order('order_index');

      if (error) throw error;

      setFlashcards((data || []).map(card => ({
        ...card,
        front_data: card.front_data as { text: string; media?: string[] },
        back_data: card.back_data as { text: string; media?: string[] },
      })));
    } catch (error: any) {
      console.error('Error fetching flashcards:', error);
      toast.error('Failed to load flashcards');
    } finally {
      setLoading(false);
    }
  };

  const checkBookmark = async () => {
    if (!user || !id) return;

    const { data } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('user_id', user.id)
      .eq('content_id', parseInt(id))
      .eq('content_type', 'memorization')
      .maybeSingle();

    setIsBookmarked(!!data);
  };

  const toggleBookmark = async () => {
    if (!user || !id) return;

    try {
      if (isBookmarked) {
        await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('content_id', parseInt(id))
          .eq('content_type', 'memorization');
        
        setIsBookmarked(false);
        toast.success('Bookmark removed');
      } else {
        await supabase
          .from('bookmarks')
          .insert({
            user_id: user.id,
            content_id: parseInt(id!),
            content_type: 'memorization',
          });
        
        setIsBookmarked(true);
        toast.success('Bookmark added');
      }
    } catch (error: any) {
      console.error('Error toggling bookmark:', error);
      toast.error('Failed to update bookmark');
    }
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from('memorizations')
        .update({ deleted: true })
        .eq('id', parseInt(id!));

      if (error) throw error;

      toast.success('Memorization deleted');
      navigate('/');
    } catch (error: any) {
      console.error('Error deleting:', error);
      toast.error('Failed to delete memorization');
    }
  };

  const canEdit = memorization && user && (memorization.creator_id === user.id || isModerator || isAdmin);

  if (loading || !memorization) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navigation */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-lg font-semibold truncate">{memorization.title}</h1>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleBookmark}
            >
              <BookmarkIcon
                size={20}
                className={isBookmarked ? 'fill-foreground text-foreground' : 'text-foreground'}
              />
            </Button>
            {canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditDialogOpen(true)}
                >
                  <Edit size={20} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 size={20} className="text-destructive" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 px-4 py-6 mb-24">
        {/* Info Card */}
        <Card className="p-4 mb-6">
          <h2 className="text-xl font-bold mb-2">{memorization.title}</h2>
          {memorization.description && (
            <p className="text-muted-foreground mb-3">{memorization.description}</p>
          )}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Created by {creatorName}</span>
            <span>{flashcards.length} cards</span>
          </div>
        </Card>

        {/* Study Button */}
        {flashcards.length > 0 && (
          <Button
            className="w-full mb-6 gap-2"
            size="lg"
            onClick={() => setStudyDialogOpen(true)}
          >
            <Play className="w-5 h-5" />
            Start Study Session
          </Button>
        )}

        {/* Flashcards List */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Flashcards</h3>
          {flashcards.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No flashcards yet
            </Card>
          ) : (
            flashcards.map((card, index) => (
              <Card key={card.id} className="p-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                      Card {index + 1} - Front
                    </h4>
                    <p className="mb-2">{card.front_data.text}</p>
                    {card.front_data.media && card.front_data.media.length > 0 && (
                      <div className="space-y-2">
                        {card.front_data.media.map((url, i) => (
                          <MediaPreview key={i} url={url} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                      Card {index + 1} - Back
                    </h4>
                    <p className="mb-2">{card.back_data.text}</p>
                    {card.back_data.media && card.back_data.media.length > 0 && (
                      <div className="space-y-2">
                        {card.back_data.media.map((url, i) => (
                          <MediaPreview key={i} url={url} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </main>

      <BottomNavigation onTabChange={(tab) => {
        if (tab === 'subjects') navigate('/');
        else if (tab === 'bookmarks') navigate('/bookmarks');
        else if (tab === 'profile') navigate('/profile');
      }} activeTab="" />

      {studyDialogOpen && (
        <StudySessionDialog
          memorizationId={parseInt(id!)}
          onClose={() => setStudyDialogOpen(false)}
        />
      )}

      {editDialogOpen && (
        <EditMemorizationDialog
          open={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
          memorizationId={parseInt(id!)}
          onSuccess={() => {
            setEditDialogOpen(false);
            fetchMemorization();
            fetchFlashcards();
          }}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
    </div>
  );
}
