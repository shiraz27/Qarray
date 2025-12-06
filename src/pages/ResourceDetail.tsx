import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, ThumbsUp, ThumbsDown, FileText, Edit, Trash2, AlertCircle, Share2, Bookmark, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BottomNavigation } from '@/components/BottomNavigation';
import { ContentSkeleton } from '@/components/LoadingSkeleton';
import chapterPattern from '@/assets/chapter-pattern.png';
import qarayLogo from '@/assets/qarray-logo-new.png';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { MediaList } from '@/components/MediaList';
import { UserAvatar } from '@/components/UserAvatar';
import { AskQuestionForm } from '@/components/AskQuestionForm';
import { EditResourceForm } from '@/components/EditResourceForm';
import { EmptyState } from '@/components/EmptyState';
import { SEO, createLearningResourceSchema } from '@/components/SEO';

import { useUserRole } from '@/hooks/useUserRole';

interface Resource {
  id: number;
  title: string;
  description: string;
  data: string[];
  type_id: number | null;
  devoir_type_id: number | null;
  with_correction: boolean;
  created_at: string;
  verified: boolean;
  published_by: string | null;
  chapter_id: number | null;
  upvotes: number;
  downvotes: number;
  userVote: string | null;
  isBookmarked?: boolean;
  ocr_text?: string | null;
  ocr_status?: string | null;
}

interface ContextData {
  className?: string;
  subjectName?: string;
  chapterName?: string;
}

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
}

export default function ResourceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('subjects');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAskQuestionDialogOpen, setIsAskQuestionDialogOpen] = useState(false);
  const [resourceTypes, setResourceTypes] = useState<Array<{ id: number; type: string }>>([]);
  const [devoirTypes, setDevoirTypes] = useState<Array<{ id: number; devoir_type: string }>>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
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
    const fetchResource = async () => {
      if (!id) return;

      const resourceId = Number(id);
      if (isNaN(resourceId)) return;

      const { data: resourceData, error } = await supabase
        .from('resources')
        .select('*')
        .eq('id', resourceId)
        .eq('deleted', false)
        .single();

      if (error || !resourceData) {
        toast({
          title: 'Error',
          description: 'Resource not found',
          variant: 'destructive',
        });
        navigate(-1);
        return;
      }

      // Get vote counts
      const { count: upvotes } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('content_id', resourceData.id)
        .eq('content_type', 'resource')
        .eq('vote_type', 'upvote');

      const { count: downvotes } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('content_id', resourceData.id)
        .eq('content_type', 'resource')
        .eq('vote_type', 'downvote');

      // Get user's vote
      let userVote = null;
      let isBookmarked = false;
      if (user) {
        const { data: voteData } = await supabase
          .from('votes')
          .select('vote_type')
          .eq('content_id', resourceData.id)
          .eq('content_type', 'resource')
          .eq('user_id', user.id)
          .maybeSingle();

        userVote = voteData?.vote_type || null;

        // Check if bookmarked
        const { data: bookmarkData } = await supabase
          .from('bookmarks')
          .select('id')
          .eq('user_id', user.id)
          .eq('content_type', 'resource')
          .eq('content_id', resourceData.id)
          .maybeSingle();

        isBookmarked = !!bookmarkData;
      }

      setResource({
        ...resourceData,
        upvotes: upvotes || 0,
        downvotes: downvotes || 0,
        userVote,
        isBookmarked,
      });

      // Fetch context data (chapter -> subject -> class)
      if (resourceData.chapter_id) {
        const { data: chapterData } = await supabase
          .from('chapters')
          .select('name, subject_id')
          .eq('id', resourceData.chapter_id)
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

      // Fetch questions related to this resource
      const { data: questionsData } = await supabase
        .from('questions')
        .select('*')
        .eq('resource_id', resourceId)
        .eq('deleted', false)
        .order('created_at', { ascending: false });

      const questionsWithDetails = await Promise.all(
        (questionsData || []).map(async (question) => {
          const { count: upvotes } = await supabase
            .from('votes')
            .select('*', { count: 'exact', head: true })
            .eq('content_id', question.id)
            .eq('content_type', 'question')
            .eq('vote_type', 'upvote');

          const { count: downvotes } = await supabase
            .from('votes')
            .select('*', { count: 'exact', head: true })
            .eq('content_id', question.id)
            .eq('content_type', 'question')
            .eq('vote_type', 'downvote');

          const { count: answerCount } = await supabase
            .from('answers')
            .select('*', { count: 'exact', head: true })
            .eq('question_id', question.id)
            .eq('deleted', false);

          let userVote = null;
          if (user) {
            const { data: voteData } = await supabase
              .from('votes')
              .select('vote_type')
              .eq('content_id', question.id)
              .eq('content_type', 'question')
              .eq('user_id', user.id)
              .maybeSingle();

            userVote = voteData?.vote_type || null;
          }

          return {
            ...question,
            upvotes: upvotes || 0,
            downvotes: downvotes || 0,
            userVote,
            answerCount: answerCount || 0,
          };
        })
      );

      setQuestions(questionsWithDetails);
      setLoading(false);
    };

    fetchResource();
  }, [id, user, navigate, toast]);

  useEffect(() => {
    const fetchResourceTypes = async () => {
      const { data: types } = await supabase
        .from('resource_types')
        .select('id, type')
        .order('id');
      if (types) setResourceTypes(types);

      const { data: devoirTypesData } = await supabase
        .from('devoir_types')
        .select('id, devoir_type')
        .order('id');
      if (devoirTypesData) setDevoirTypes(devoirTypesData);
    };
    fetchResourceTypes();
  }, []);

  const handleVote = async (voteType: string, currentVote: string | null) => {
    if (!user || !resource) {
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
        .eq('content_id', resource.id)
        .eq('content_type', 'resource')
        .eq('user_id', user.id);
    } else {
      if (currentVote) {
        await supabase
          .from('votes')
          .delete()
          .eq('content_id', resource.id)
          .eq('content_type', 'resource')
          .eq('user_id', user.id);
      }

      await supabase.from('votes').insert({
        content_id: resource.id,
        content_type: 'resource',
        user_id: user.id,
        vote_type: voteType,
      });
    }

    // Refetch votes instead of reloading
    const { count: upvotes } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('content_id', resource.id)
      .eq('content_type', 'resource')
      .eq('vote_type', 'upvote');

    const { count: downvotes } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('content_id', resource.id)
      .eq('content_type', 'resource')
      .eq('vote_type', 'downvote');

    const { data: voteData } = await supabase
      .from('votes')
      .select('vote_type')
      .eq('content_id', resource.id)
      .eq('content_type', 'resource')
      .eq('user_id', user.id)
      .maybeSingle();

    setResource(prev => prev ? {
      ...prev,
      upvotes: upvotes || 0,
      downvotes: downvotes || 0,
      userVote: voteData?.vote_type || null
    } : null);
  };

  const handleDelete = async () => {
    const resourceId = Number(id);
    if (isNaN(resourceId)) return;

    // Delete associated files from Archive.org first
    if (resource?.data && Array.isArray(resource.data)) {
      for (const fileUrl of resource.data) {
        if (fileUrl.includes('archive.org')) {
          try {
            await supabase.functions.invoke('delete-from-archive', {
              body: { fileUrl }
            });
          } catch (err) {
            console.error('Error deleting file from archive:', err);
          }
        }
      }
    }

    const { error } = await supabase
      .from('resources')
      .update({ deleted: true })
      .eq('id', resourceId);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete resource',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Success',
      description: 'Resource deleted successfully',
    });

    navigate(-1);
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
    const message = `Check out this resource on Qarray - A free e-learning platform for student collaboration! 🎓\n\n${url}`;
    navigator.clipboard.writeText(message);
    toast({
      title: 'Link copied!',
      description: 'Share this resource with your friends',
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

    if (!resource) return;

    try {
      if (resource.isBookmarked) {
        await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('content_type', 'resource')
          .eq('content_id', resource.id);

        setResource({ ...resource, isBookmarked: false });
        toast({
          title: 'Success',
          description: 'Bookmark removed',
        });
      } else {
        await supabase
          .from('bookmarks')
          .insert({ 
            user_id: user.id, 
            content_type: 'resource',
            content_id: resource.id 
          });

        setResource({ ...resource, isBookmarked: true });
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


  const isOwner = user && resource?.published_by === user.id;
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
                className={resource?.isBookmarked ? 'fill-current text-primary' : 'text-primary'}
              />
            </Button>
          </div>
        </div>
      </div>
        <div className="flex-1 p-4">
          <ContentSkeleton />
        </div>
        <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
      </div>
    );
  }

  if (!resource) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      <SEO
        title={`${resource.title}${contextData?.subjectName ? ` - ${contextData.subjectName}` : ''}${contextData?.className ? ` | ${contextData.className}` : ''}`}
        description={(() => {
          const ocrSnippet = resource.ocr_text?.substring(0, 200)?.replace(/\s+/g, ' ')?.trim() || '';
          const baseDesc = resource.description;
          const context = [contextData?.subjectName, contextData?.className, 'Tunisie'].filter(Boolean).join(' - ');
          return `${baseDesc}${ocrSnippet ? ` - ${ocrSnippet}...` : ''} | ${context}`;
        })()}
        url={`/resource/${id}`}
        keywords={[
          resource.title,
          contextData?.subjectName,
          contextData?.chapterName,
          contextData?.className,
          'cours', 'exercices', 'ressources éducatives', 'baccalauréat'
        ].filter(Boolean) as string[]}
        jsonLd={createLearningResourceSchema(
          resource.title,
          resource.description,
          `/resource/${id}`,
          'Educational Resource',
          {
            textContent: resource.ocr_text || undefined,
            className: contextData?.className,
            subjectName: contextData?.subjectName,
            chapterName: contextData?.chapterName,
            keywords: [resource.title]
          }
        )}
      />
      <div className="sticky top-0 z-50 bg-white border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => {
            const chapterId = resource?.chapter_id;
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
                className={resource?.isBookmarked ? 'fill-current text-primary' : 'text-primary'}
              />
            </Button>
          </div>
        </div>
      </div>

      {/* Resource Banner */}
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
          {resource.published_by && (
            <UserAvatar 
              userId={resource.published_by} 
              size="md" 
              showName 
              showDate 
              date={resource.created_at}
            />
          )}
          
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-foreground mb-2">{resource.title}</h2>
              <p className="text-sm text-muted-foreground mb-3">{resource.description}</p>
              <MediaList data={resource.data.join('\n')} showText={true} />
            </div>
            {!resource.verified && (
              <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs flex-shrink-0">
                <AlertCircle size={12} />
                <span>Unverified</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-muted-foreground" />
              <span className="text-sm">{resource.data.length} file(s)</span>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => handleVote('upvote', resource.userVote)}
                className="flex items-center gap-1.5 transition-colors hover:text-green-600"
              >
                <ThumbsUp
                  size={20}
                  className={resource.userVote === 'upvote' ? 'fill-green-600 text-green-600' : ''}
                />
                <span className="text-sm font-medium">{resource.upvotes}</span>
              </button>
              <button
                onClick={() => handleVote('downvote', resource.userVote)}
                className="flex items-center gap-1.5 transition-colors hover:text-red-600"
              >
                <ThumbsDown
                  size={20}
                  className={resource.userVote === 'downvote' ? 'fill-red-600 text-red-600' : ''}
                />
                <span className="text-sm font-medium">{resource.downvotes}</span>
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
                    <DialogTitle>Edit Resource</DialogTitle>
                  </DialogHeader>
                  <EditResourceForm
                    resourceId={resource.id}
                    chapterId={resource.chapter_id!}
                    initialData={{
                      title: resource.title,
                      description: resource.description,
                      data: resource.data,
                      type_id: resource.type_id,
                      devoir_type_id: resource.devoir_type_id,
                      with_correction: resource.with_correction,
                    }}
                    resourceTypes={resourceTypes}
                    devoirTypes={devoirTypes}
                    onSuccess={async () => {
                      setIsEditDialogOpen(false);
                      // Refetch resource data
                      const { data: resourceData } = await supabase
                        .from('resources')
                        .select('*')
                        .eq('id', resource.id)
                        .eq('deleted', false)
                        .single();
                      
                      if (resourceData) {
                        setResource(prev => prev ? {
                          ...prev,
                          title: resourceData.title,
                          description: resourceData.description,
                          data: resourceData.data,
                          type_id: resourceData.type_id,
                          devoir_type_id: resourceData.devoir_type_id,
                          with_correction: resourceData.with_correction
                        } : null);
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
                    <AlertDialogTitle>Delete Resource?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the resource.
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

      {/* Questions Section */}
      <div className="flex-1 px-4 py-6 border-t space-y-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Questions about this resource</h2>
          <Dialog open={isAskQuestionDialogOpen} onOpenChange={setIsAskQuestionDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Ask Question</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Ask a Question</DialogTitle>
              </DialogHeader>
              {resource.chapter_id && (
                <AskQuestionForm
                  chapterId={resource.chapter_id}
                  resourceId={resource.id}
                  resourceTypes={resourceTypes}
                  onSuccess={async () => {
                    setIsAskQuestionDialogOpen(false);
                    toast({
                      title: 'Success',
                      description: 'Question added successfully',
                    });
                    // Refetch questions
                    const { data: questionsData } = await supabase
                      .from('questions')
                      .select('*')
                      .eq('resource_id', resource.id)
                      .eq('deleted', false)
                      .order('created_at', { ascending: false });

                    const questionsWithDetails = await Promise.all(
                      (questionsData || []).map(async (question) => {
                        const { count: upvotes } = await supabase
                          .from('votes')
                          .select('*', { count: 'exact', head: true })
                          .eq('content_id', question.id)
                          .eq('content_type', 'question')
                          .eq('vote_type', 'upvote');

                        const { count: downvotes } = await supabase
                          .from('votes')
                          .select('*', { count: 'exact', head: true })
                          .eq('content_id', question.id)
                          .eq('content_type', 'question')
                          .eq('vote_type', 'downvote');

                        const { count: answerCount } = await supabase
                          .from('answers')
                          .select('*', { count: 'exact', head: true })
                          .eq('question_id', question.id)
                          .eq('deleted', false);

                        let userVote = null;
                        if (user) {
                          const { data: voteData } = await supabase
                            .from('votes')
                            .select('vote_type')
                            .eq('content_id', question.id)
                            .eq('content_type', 'question')
                            .eq('user_id', user.id)
                            .maybeSingle();

                          userVote = voteData?.vote_type || null;
                        }

                        return {
                          ...question,
                          upvotes: upvotes || 0,
                          downvotes: downvotes || 0,
                          userVote,
                          answerCount: answerCount || 0,
                        };
                      })
                    );

                    setQuestions(questionsWithDetails);
                  }}
                  onCancel={() => setIsAskQuestionDialogOpen(false)}
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
        
        {questions.length === 0 ? (
          <EmptyState 
            type="questions" 
            message="No questions yet. Be the first to ask something about this resource!" 
          />
        ) : (
          questions.map((question) => (
            <Card 
              key={question.id} 
              className="p-4 space-y-3 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/question/${question.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-2">
                  <MediaList data={question.data} showText={true} />
                </div>
                {!question.verified && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs flex-shrink-0">
                    <AlertCircle size={12} />
                    <span>Unverified</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={16} className="text-muted-foreground" />
                    <span className="text-sm font-medium">{question.answerCount} {t('answers') || 'Answers'}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <ThumbsUp
                      size={16}
                      className={question.userVote === 'upvote' ? 'fill-green-600 text-green-600' : 'text-muted-foreground'}
                    />
                    <span className="text-sm font-medium">{question.upvotes}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ThumbsDown
                      size={16}
                      className={question.userVote === 'downvote' ? 'fill-red-600 text-red-600' : 'text-muted-foreground'}
                    />
                    <span className="text-sm font-medium">{question.downvotes}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
    </div>
  );
}
