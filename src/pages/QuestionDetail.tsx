import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, ThumbsUp, ThumbsDown, MessageSquare, Edit, Trash2, AlertCircle, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BottomNavigation } from '@/components/BottomNavigation';
import { ContentSkeleton } from '@/components/LoadingSkeleton';
import chapterPattern from '@/assets/chapter-pattern.png';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { MediaList } from '@/components/MediaList';
import { UserAvatar } from '@/components/UserAvatar';
import { AnswerQuestionForm } from '@/components/AnswerQuestionForm';
import { EditQuestionForm } from '@/components/EditQuestionForm';

import { useUserRole } from '@/hooks/useUserRole';

interface Question {
  id: number;
  data: string;
  type_id: number | null;
  created_at: string;
  verified: boolean;
  contributors: string[];
  upvotes: number;
  downvotes: number;
  userVote: string | null;
  answerCount: number;
}

interface Answer {
  id: number;
  data: string;
  created_at: string;
  verified: boolean;
  contributors: string[];
  upvotes: number;
  downvotes: number;
  userVote: string | null;
}

export default function QuestionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [question, setQuestion] = useState<Question | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('subjects');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAnswerDialogOpen, setIsAnswerDialogOpen] = useState(false);
  const [resourceTypes, setResourceTypes] = useState<Array<{ id: number; type: string }>>([]);
  const { isModerator } = useUserRole();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  useEffect(() => {
    const fetchQuestion = async () => {
      if (!id) return;

      const questionId = Number(id);
      if (isNaN(questionId)) return;

      const { data: questionData, error } = await supabase
        .from('questions')
        .select('*')
        .eq('id', questionId)
        .eq('deleted', false)
        .single();

      if (error || !questionData) {
        toast({
          title: 'Error',
          description: 'Question not found',
          variant: 'destructive',
        });
        navigate(-1);
        return;
      }

      // Get vote counts
      const { count: upvotes } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('content_id', questionData.id)
        .eq('content_type', 'question')
        .eq('vote_type', 'upvote');

      const { count: downvotes } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('content_id', questionData.id)
        .eq('content_type', 'question')
        .eq('vote_type', 'downvote');

      // Get user's vote
      let userVote = null;
      if (user) {
        const { data: voteData } = await supabase
          .from('votes')
          .select('vote_type')
          .eq('content_id', questionData.id)
          .eq('content_type', 'question')
          .eq('user_id', user.id)
          .maybeSingle();

        userVote = voteData?.vote_type || null;
      }

      // Get answer count
      const { count: answerCount } = await supabase
        .from('answers')
        .select('*', { count: 'exact', head: true })
        .eq('question_id', questionData.id)
        .eq('deleted', false);

      setQuestion({
        ...questionData,
        upvotes: upvotes || 0,
        downvotes: downvotes || 0,
        userVote,
        answerCount: answerCount || 0,
      });

      // Fetch answers
      const { data: answersData } = await supabase
        .from('answers')
        .select('*')
        .eq('question_id', questionData.id)
        .eq('deleted', false)
        .order('created_at', { ascending: false });

      const answersWithVotes = await Promise.all(
        (answersData || []).map(async (answer) => {
          const { count: upvotes } = await supabase
            .from('votes')
            .select('*', { count: 'exact', head: true })
            .eq('content_id', answer.id)
            .eq('content_type', 'answer')
            .eq('vote_type', 'upvote');

          const { count: downvotes } = await supabase
            .from('votes')
            .select('*', { count: 'exact', head: true })
            .eq('content_id', answer.id)
            .eq('content_type', 'answer')
            .eq('vote_type', 'downvote');

          let userVote = null;
          if (user) {
            const { data: voteData } = await supabase
              .from('votes')
              .select('vote_type')
              .eq('content_id', answer.id)
              .eq('content_type', 'answer')
              .eq('user_id', user.id)
              .maybeSingle();

            userVote = voteData?.vote_type || null;
          }

          return {
            ...answer,
            upvotes: upvotes || 0,
            downvotes: downvotes || 0,
            userVote,
          };
        })
      );

      setAnswers(answersWithVotes);
      setLoading(false);
    };

    fetchQuestion();
  }, [id, user, navigate, toast]);

  const handleVote = async (contentId: number, contentType: string, voteType: string, currentVote: string | null) => {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'Please log in to vote',
        variant: 'destructive',
      });
      return;
    }

    if (currentVote === voteType) {
      await supabase
        .from('votes')
        .delete()
        .eq('content_id', contentId)
        .eq('content_type', contentType)
        .eq('user_id', user.id);
    } else {
      if (currentVote) {
        await supabase
          .from('votes')
          .delete()
          .eq('content_id', contentId)
          .eq('content_type', contentType)
          .eq('user_id', user.id);
      }

      await supabase.from('votes').insert({
        content_id: contentId,
        content_type: contentType,
        user_id: user.id,
        vote_type: voteType,
      });
    }

    // Refresh data
    window.location.reload();
  };

  const handleDelete = async () => {
    const questionId = Number(id);
    if (isNaN(questionId)) return;

    console.log('Attempting to delete question:', questionId);
    console.log('User ID:', user?.id);
    console.log('Is Moderator:', isModerator);
    console.log('Question contributors:', question?.contributors);

    const { error } = await supabase
      .from('questions')
      .update({ deleted: true })
      .eq('id', questionId);

    console.log('Delete result:', { error });

    if (error) {
      console.error('Delete error details:', error);
      toast({
        title: 'Error',
        description: `Failed to delete question: ${error.message}`,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Success',
      description: 'Question deleted successfully',
    });

    navigate(-1);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'subjects') navigate('/');
    else if (tab === 'bookmarks') navigate('/bookmarks');
    else if (tab === 'profile') navigate('/profile');
  };

  const handleShare = () => {
    const url = window.location.href;
    const message = `Check out this question on Qarray - A free e-learning platform for student collaboration! 🎓\n\n${url}`;
    navigator.clipboard.writeText(message);
    toast({
      title: 'Link copied!',
      description: 'Share this question with your friends',
    });
  };

  const isOwner = user && question?.contributors?.includes(user.id);
  const canEdit = isOwner || isModerator;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-lg font-semibold flex-1">{t('question') || 'Question'}</h1>
        </div>
        <div className="flex-1 p-4">
          <ContentSkeleton />
        </div>
        <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-lg font-semibold flex-1">{t('question') || 'Question'}</h1>
      </div>

      {/* Question Banner */}
      <Card 
        className="relative overflow-hidden p-6 m-4 border-none"
        style={{
          background: 'linear-gradient(to right, #FFFFFF 0%, #FDE6E6 100%)',
        }}
      >
        <div 
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: `url(${chapterPattern})`,
            backgroundSize: 'auto',
            backgroundRepeat: 'repeat',
            imageRendering: 'crisp-edges',
          }}
        />
          
        <div className="relative z-10 space-y-4">
          {question.contributors && question.contributors.length > 0 && (
            <UserAvatar 
              userId={question.contributors[0]} 
              size="md" 
              showName 
              showDate 
              date={question.created_at}
            />
          )}
          
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-3">
              <MediaList data={question.data} showText={true} />
            </div>
            {!question.verified && (
              <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs flex-shrink-0">
                <AlertCircle size={12} />
                <span>Unverified</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium">{question.answerCount} {t('answers') || 'Answers'}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => handleVote(question.id, 'question', 'upvote', question.userVote)}
                className="flex items-center gap-1.5 transition-colors hover:text-green-600"
              >
                <ThumbsUp
                  size={20}
                  className={question.userVote === 'upvote' ? 'fill-green-600 text-green-600' : ''}
                />
                <span className="text-sm font-medium">{question.upvotes}</span>
              </button>
              <button
                onClick={() => handleVote(question.id, 'question', 'downvote', question.userVote)}
                className="flex items-center gap-1.5 transition-colors hover:text-red-600"
              >
                <ThumbsDown
                  size={20}
                  className={question.userVote === 'downvote' ? 'fill-red-600 text-red-600' : ''}
                />
                <span className="text-sm font-medium">{question.downvotes}</span>
              </button>
              <Button variant="outline" size="sm" onClick={handleShare}>
                <Share2 size={16} className="mr-1" />
                Share
              </Button>
            </div>
          </div>

          {canEdit && (
            <div className="flex gap-2 pt-2 border-t">
              <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                  >
                    <Edit size={16} className="mr-1" />
                    Edit
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Edit Question</DialogTitle>
                  </DialogHeader>
                  <EditQuestionForm
                    questionId={question.id}
                    initialData={question.data}
                    onSuccess={() => {
                      setIsEditDialogOpen(false);
                      window.location.reload();
                    }}
                    onCancel={() => setIsEditDialogOpen(false)}
                  />
                </DialogContent>
              </Dialog>

              <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  <Trash2 size={16} className="mr-1" />
                  Delete
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Question?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the question and all its answers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </Card>

      {/* Answers Section */}
      <div className="flex-1 px-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('answers') || 'Answers'}</h2>
          <Dialog open={isAnswerDialogOpen} onOpenChange={setIsAnswerDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Add Answer</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Answer this Question</DialogTitle>
              </DialogHeader>
              <AnswerQuestionForm
                questionId={Number(id)}
                onSuccess={() => {
                  setIsAnswerDialogOpen(false);
                  window.location.reload();
                }}
                onCancel={() => setIsAnswerDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
        {answers.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No answers yet</p>
          </Card>
        ) : (
          answers.map((answer) => (
            <Card key={answer.id} className="p-4 space-y-3">
              {answer.contributors && answer.contributors.length > 0 && (
                <UserAvatar 
                  userId={answer.contributors[0]} 
                  size="sm" 
                  showName 
                  showDate 
                  date={answer.created_at}
                />
              )}
              
              <div className="flex-1 space-y-2">
                <MediaList data={answer.data} showText={true} />
              </div>
              
              <div className="flex items-center justify-end gap-4 pt-2 border-t">
                <button
                  onClick={() => handleVote(answer.id, 'answer', 'upvote', answer.userVote)}
                  className="flex items-center gap-1.5 transition-colors hover:text-green-600"
                >
                  <ThumbsUp
                    size={16}
                    className={answer.userVote === 'upvote' ? 'fill-green-600 text-green-600' : ''}
                  />
                  <span className="text-sm font-medium">{answer.upvotes}</span>
                </button>
                <button
                  onClick={() => handleVote(answer.id, 'answer', 'downvote', answer.userVote)}
                  className="flex items-center gap-1.5 transition-colors hover:text-red-600"
                >
                  <ThumbsDown
                    size={16}
                    className={answer.userVote === 'downvote' ? 'fill-red-600 text-red-600' : ''}
                  />
                  <span className="text-sm font-medium">{answer.downvotes}</span>
                </button>
              </div>
            </Card>
          ))
        )}
      </div>

      <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
    </div>
  );
}
