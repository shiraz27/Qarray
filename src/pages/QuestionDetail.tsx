import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, ThumbsUp, ThumbsDown, MessageSquare, Edit, Trash2, AlertCircle, Share2, Bookmark } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BottomNavigation } from '@/components/BottomNavigation';
import { ContentSkeleton } from '@/components/LoadingSkeleton';
import chapterPattern from '@/assets/chapter-pattern.png';
import qarayLogo from '@/assets/qarray-logo-new.png';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { MediaList } from '@/components/MediaList';
import { UserAvatar } from '@/components/UserAvatar';
import { AnswerQuestionForm } from '@/components/AnswerQuestionForm';
import { EditQuestionForm } from '@/components/EditQuestionForm';
import { EditAnswerForm } from '@/components/EditAnswerForm';
import { extractMediaFromText } from '@/utils/mediaHelpers';
import { EmptyState } from '@/components/EmptyState';
import { SEO, createQAPageSchema } from '@/components/SEO';
import { capitalizeEveryWord } from '@/utils/textHelpers';

import { useUserRole } from '@/hooks/useUserRole';

interface Question {
  id: number;
  data: string;
  type_id: number | null;
  chapter_id: number;
  created_at: string;
  verified: boolean;
  contributors: string[];
  upvotes: number;
  downvotes: number;
  userVote: string | null;
  answerCount: number;
  isBookmarked?: boolean;
  book?: string | null;
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

interface ContextData {
  className?: string;
  subjectName?: string;
  chapterName?: string;
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
  const [editingAnswerId, setEditingAnswerId] = useState<number | null>(null);
  const [deletingAnswerId, setDeletingAnswerId] = useState<number | null>(null);
  const [resourceTypes, setResourceTypes] = useState<Array<{ id: number; type: string }>>([]);
  const [contextData, setContextData] = useState<ContextData | null>(null);
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
      let isBookmarked = false;
      if (user) {
        const { data: voteData } = await supabase
          .from('votes')
          .select('vote_type')
          .eq('content_id', questionData.id)
          .eq('content_type', 'question')
          .eq('user_id', user.id)
          .maybeSingle();

        userVote = voteData?.vote_type || null;

        // Check if bookmarked
        const { data: bookmarkData } = await supabase
          .from('bookmarks')
          .select('id')
          .eq('user_id', user.id)
          .eq('content_type', 'question')
          .eq('content_id', questionData.id)
          .maybeSingle();

        isBookmarked = !!bookmarkData;
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
        isBookmarked,
      });

      // Fetch context data (chapter -> subject -> class)
      if (questionData.chapter_id) {
        const { data: chapterData } = await supabase
          .from('chapters')
          .select('name, subject_id')
          .eq('id', questionData.chapter_id)
          .single();
        
        if (chapterData?.subject_id) {
          const { data: subjectData } = await supabase
            .from('subjects')
            .select('name, class_id')
            .eq('id', chapterData.subject_id)
            .single();
          
          if (subjectData?.class_id) {
            const { data: classData } = await supabase
              .from('classes')
              .select('name')
              .eq('id', subjectData.class_id)
              .single();
            
            setContextData({
              chapterName: chapterData.name,
              subjectName: subjectData.name,
              className: classData?.name
            });
          } else {
            setContextData({
              chapterName: chapterData.name,
              subjectName: subjectData.name
            });
          }
        } else {
          setContextData({
            chapterName: chapterData?.name
          });
        }
      }

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

    // Refetch data instead of reloading the page
    if (contentType === 'question') {
      const { count: upvotes } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('content_id', contentId)
        .eq('content_type', 'question')
        .eq('vote_type', 'upvote');

      const { count: downvotes } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('content_id', contentId)
        .eq('content_type', 'question')
        .eq('vote_type', 'downvote');

      const { data: voteData } = await supabase
        .from('votes')
        .select('vote_type')
        .eq('content_id', contentId)
        .eq('content_type', 'question')
        .eq('user_id', user.id)
        .maybeSingle();

      setQuestion(prev => prev ? {
        ...prev,
        upvotes: upvotes || 0,
        downvotes: downvotes || 0,
        userVote: voteData?.vote_type || null
      } : null);
    } else {
      // Update answer vote
      const updatedAnswers = await Promise.all(
        answers.map(async (answer) => {
          if (answer.id !== contentId) return answer;

          const { count: upvotes } = await supabase
            .from('votes')
            .select('*', { count: 'exact', head: true })
            .eq('content_id', contentId)
            .eq('content_type', 'answer')
            .eq('vote_type', 'upvote');

          const { count: downvotes } = await supabase
            .from('votes')
            .select('*', { count: 'exact', head: true })
            .eq('content_id', contentId)
            .eq('content_type', 'answer')
            .eq('vote_type', 'downvote');

          const { data: voteData } = await supabase
            .from('votes')
            .select('vote_type')
            .eq('content_id', contentId)
            .eq('content_type', 'answer')
            .eq('user_id', user.id)
            .maybeSingle();

          return {
            ...answer,
            upvotes: upvotes || 0,
            downvotes: downvotes || 0,
            userVote: voteData?.vote_type || null
          };
        })
      );
      setAnswers(updatedAnswers);
    }
  };

  const handleDelete = async () => {
    const questionId = Number(id);
    if (isNaN(questionId)) return;

    try {
      console.log('Attempting to delete question:', questionId);
      console.log('User ID:', user?.id);
      console.log('Is Moderator:', isModerator);
      console.log('Question contributors:', question?.contributors);

      // Delete associated files from Archive.org first
      if (question?.data) {
        const { media } = extractMediaFromText(question.data);
        for (const mediaFile of media) {
          if (mediaFile.url.includes('archive.org')) {
            try {
              await supabase.functions.invoke('delete-from-archive', {
                body: { fileUrl: mediaFile.url }
              });
            } catch (err) {
              console.error('Error deleting file from archive:', err);
            }
          }
        }
      }

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
    } catch (error) {
      console.error('Unexpected error during deletion:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while deleting',
        variant: 'destructive',
      });
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'subjects') navigate('/dashboard');
    else if (tab === 'bookmarks') navigate('/bookmarks');
    else if (tab === 'classmates') navigate('/classmates');
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

  const toggleBookmark = async () => {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'Please log in to bookmark',
        variant: 'destructive',
      });
      return;
    }

    if (!question) return;

    try {
      if (question.isBookmarked) {
        await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('content_type', 'question')
          .eq('content_id', question.id);

        setQuestion({ ...question, isBookmarked: false });
        toast({
          title: 'Success',
          description: 'Bookmark removed',
        });
      } else {
        await supabase
          .from('bookmarks')
          .insert({ 
            user_id: user.id, 
            content_type: 'question',
            content_id: question.id 
          });

        setQuestion({ ...question, isBookmarked: true });
        toast({
          title: 'Success',
          description: 'Bookmark added',
        });
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      toast({
        title: 'Error',
        description: 'Failed to update bookmark',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteAnswer = async (answerId: number) => {
    try {
      // First get the answer data to delete associated files
      const { data: answerData } = await supabase
        .from('answers')
        .select('data')
        .eq('id', answerId)
        .single();

      // Delete associated files from Archive.org first
      if (answerData?.data) {
        const { media } = extractMediaFromText(answerData.data);
        for (const mediaFile of media) {
          if (mediaFile.url.includes('archive.org')) {
            try {
              await supabase.functions.invoke('delete-from-archive', {
                body: { fileUrl: mediaFile.url }
              });
            } catch (err) {
              console.error('Error deleting file from archive:', err);
            }
          }
        }
      }

      const { error } = await supabase
        .from('answers')
        .update({ deleted: true })
        .eq('id', answerId);

      if (error) {
        toast({
          title: 'Error',
          description: `Failed to delete answer: ${error.message}`,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Success',
        description: 'Answer deleted successfully',
      });

      // Remove answer from state
      setAnswers(prev => prev.filter(a => a.id !== answerId));
      setQuestion(prev => prev ? {
        ...prev,
        answerCount: (prev.answerCount || 1) - 1
      } : null);
      setDeletingAnswerId(null);
    } catch (error) {
      console.error('Unexpected error during answer deletion:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while deleting',
        variant: 'destructive',
      });
    }
  };

  const canEditAnswer = (answer: Answer) => {
    return user && (answer.contributors?.includes(user.id) || isModerator);
  };

  const isOwner = user && question?.contributors?.includes(user.id);
  const canEdit = isOwner || isModerator;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <div className="sticky top-0 z-50 bg-white border-b">
          <div className="flex items-center justify-between px-4 py-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft size={20} />
            </Button>
            <div className="flex items-center gap-2">
              <img src={qarayLogo} alt="Qarray Logo" className="h-12 w-12 object-contain" />
              <span className="text-xl font-bold text-foreground">Qarray</span>
            </div>
            <div className="w-10" />
          </div>
        </div>
        <div className="flex-1 p-4">
          <ContentSkeleton />
        </div>
        <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
      </div>
    );
  }

  if (!question) return null;

  const { text: questionText } = extractMediaFromText(question.data);
  const questionPreview = questionText.substring(0, 100) + (questionText.length > 100 ? '...' : '');

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      <SEO
        title={`${questionPreview}${contextData?.subjectName ? ` - ${contextData.subjectName}` : ''}${contextData?.className ? ` | ${contextData.className}` : ''}`}
        description={(() => {
          const answerSnippets = answers.slice(0, 2).map(a => {
            const { text } = extractMediaFromText(a.data);
            return text.substring(0, 80);
          }).join(' | ');
          const context = [contextData?.subjectName, contextData?.className, 'Tunisie'].filter(Boolean).join(' - ');
          return `${questionText.substring(0, 150)} | ${answers.length} réponses${answerSnippets ? ` - ${answerSnippets}` : ''} | ${context}`;
        })()}
        url={`/question/${id}`}
        keywords={[
          'question', 'réponse',
          contextData?.subjectName,
          contextData?.chapterName,
          contextData?.className,
          'exercices', 'baccalauréat'
        ].filter(Boolean) as string[]}
        jsonLd={createQAPageSchema(
          questionText,
          answers.length,
          `/question/${id}`,
          {
            answers: answers.slice(0, 5).map(a => {
              const { text } = extractMediaFromText(a.data);
              return text;
            }),
            className: contextData?.className,
            subjectName: contextData?.subjectName,
            chapterName: contextData?.chapterName
          }
        )}
      />
      <div className="sticky top-0 z-50 bg-white border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => {
            const chapterId = question?.chapter_id;
            if (chapterId) {
              navigate(`/chapter/${chapterId}`);
            } else {
              navigate('/');
            }
          }}>
            <ArrowLeft size={20} />
          </Button>
          <div className="flex items-center gap-2">
            <img src={qarayLogo} alt="Qarray Logo" className="h-12 w-12 object-contain" />
            <span className="text-xl font-bold text-foreground">Qarray</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleShare}
              className="hover:bg-primary/10"
            >
              <Share2 size={20} className="text-primary" />
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleBookmark}>
              <Bookmark
                size={20}
                className={question?.isBookmarked ? 'fill-current text-primary' : 'text-primary'}
              />
            </Button>
          </div>
        </div>
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
              <MediaList data={question.data} showText={true} capitalizeText={true} />
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
                    chapterId={question.chapter_id}
                    initialData={question.data}
                    initialBook={(question as any).book}
                    onSuccess={async () => {
                      setIsEditDialogOpen(false);
                      // Refetch question data
                      const { data: questionData } = await supabase
                        .from('questions')
                        .select('*')
                        .eq('id', question.id)
                        .eq('deleted', false)
                        .single();
                      
                      if (questionData) {
                        setQuestion(prev => prev ? { ...prev, data: questionData.data, book: questionData.book } : null);
                      }
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
                chapterId={question.chapter_id}
                onSuccess={async () => {
                  setIsAnswerDialogOpen(false);
                  // Refetch answers
                  const { data: answersData } = await supabase
                    .from('answers')
                    .select('*')
                    .eq('question_id', Number(id))
                    .eq('deleted', false)
                    .order('created_at', { ascending: false });

                  if (answersData) {
                    const answersWithVotes = await Promise.all(
                      answersData.map(async (answer) => {
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
                    
                    // Update answer count
                    setQuestion(prev => prev ? {
                      ...prev,
                      answerCount: answersWithVotes.length
                    } : null);
                  }
                }}
                onCancel={() => setIsAnswerDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
        {answers.length === 0 ? (
          <EmptyState 
            type="questions" 
            message="No answers yet. Be the first to share your knowledge!" 
          />
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
              
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-4">
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

                {canEditAnswer(answer) && (
                  <div className="flex gap-2">
                    <Dialog open={editingAnswerId === answer.id} onOpenChange={(open) => !open && setEditingAnswerId(null)}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingAnswerId(answer.id)}
                        >
                          <Edit size={14} className="mr-1" />
                          Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Edit Answer</DialogTitle>
                        </DialogHeader>
                        <EditAnswerForm
                          answerId={answer.id}
                          questionId={Number(id)}
                          chapterId={question.chapter_id}
                          initialData={answer.data}
                          onSuccess={async () => {
                            setEditingAnswerId(null);
                            // Refetch answer data
                            const { data: answerData } = await supabase
                              .from('answers')
                              .select('*')
                              .eq('id', answer.id)
                              .eq('deleted', false)
                              .single();
                            
                            if (answerData) {
                              setAnswers(prev => prev.map(a => 
                                a.id === answer.id ? { ...a, data: answerData.data } : a
                              ));
                            }
                          }}
                          onCancel={() => setEditingAnswerId(null)}
                        />
                      </DialogContent>
                    </Dialog>

                    <AlertDialog open={deletingAnswerId === answer.id} onOpenChange={(open) => !open && setDeletingAnswerId(null)}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingAnswerId(answer.id)}
                      >
                        <Trash2 size={14} className="mr-1" />
                        Delete
                      </Button>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Answer?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete this answer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteAnswer(answer.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
    </div>
  );
}
