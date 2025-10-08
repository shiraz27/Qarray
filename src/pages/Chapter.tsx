import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MessageSquare, FileText, ArrowLeft, Bookmark, ThumbsUp, ThumbsDown, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import chapterPattern from '@/assets/chapter-pattern.png';
import { BottomNavigation } from '@/components/BottomNavigation';
import { ContentSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { AskQuestionForm } from '@/components/AskQuestionForm';
import { AddResourceForm } from '@/components/AddResourceForm';

interface ChapterData {
  id: number;
  name: string;
  questionCount: number;
  answerCount: number;
  resourceCount: number;
  isBookmarked: boolean;
}

interface Question {
  id: number;
  data: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
  userVote: 'upvote' | 'downvote' | null;
  type_id: number | null;
}

interface Resource {
  id: number;
  title: string;
  description: string;
  data: string[];
  created_at: string;
  upvotes: number;
  downvotes: number;
  userVote: 'upvote' | 'downvote' | null;
  type_id: number;
  devoir_type_id: number | null;
  with_correction: boolean;
}

interface ResourceType {
  id: number;
  type: string;
}

interface DevoirType {
  id: number;
  devoir_type: string;
}

export default function Chapter() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([]);
  const [devoirTypes, setDevoirTypes] = useState<DevoirType[]>([]);
  const [selectedTypeFilters, setSelectedTypeFilters] = useState<number[]>([]);
  const [selectedDevoirFilters, setSelectedDevoirFilters] = useState<number[]>([]);
  const [showWithCorrectionOnly, setShowWithCorrectionOnly] = useState(false);
  const [activeTab, setActiveTab] = useState('subjects');
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [isResourceDialogOpen, setIsResourceDialogOpen] = useState(false);
  const [subjectId, setSubjectId] = useState<number | null>(null);

  const handleTabChange = (tab: string) => {
    if (tab === 'subjects') {
      navigate('/');
    } else if (tab === 'bookmarks') {
      navigate('/bookmarks');
    } else if (tab === 'profile') {
      navigate('/profile');
    } else {
      setActiveTab(tab);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    // Fetch resource types and devoir types for filters
    const fetchFilters = async () => {
      // Try to get from cache first
      const cache = (window as any).__appCache;
      if (cache?.resourceTypes && cache?.devoirTypes) {
        setResourceTypes(cache.resourceTypes);
        setDevoirTypes(cache.devoirTypes);
        return;
      }

      const { data: types } = await supabase
        .from('resource_types')
        .select('*')
        .order('id');
      
      const { data: devoirTypes } = await supabase
        .from('devoir_types')
        .select('*')
        .order('id');

      setResourceTypes(types || []);
      setDevoirTypes(devoirTypes || []);
      
      // Cache for future use
      (window as any).__appCache = {
        ...(window as any).__appCache,
        resourceTypes: types || [],
        devoirTypes: devoirTypes || []
      };
    };

    fetchFilters();
  }, []);

  useEffect(() => {
    const fetchChapterData = async () => {
      if (!id) return;

      const chapterId = parseInt(id, 10);
      if (isNaN(chapterId)) return;

      setLoading(true);
      try {
        // Fetch chapter details
        const { data: chapterData, error: chapterError } = await supabase
          .from('chapters')
          .select('id, name, subject_id')
          .eq('id', chapterId)
          .eq('deleted', false)
          .single();

        if (chapterError) throw chapterError;

        setSubjectId(chapterData.subject_id);

        // Count questions
        const { count: questionCount } = await supabase
          .from('questions')
          .select('*', { count: 'exact', head: true })
          .eq('chapter_id', chapterId)
          .eq('deleted', false);

        // Count answers
        const questionIds = await supabase
          .from('questions')
          .select('id')
          .eq('chapter_id', chapterId)
          .eq('deleted', false)
          .then(res => res.data?.map(q => q.id) || []);

        const { count: answerCount } = await supabase
          .from('answers')
          .select('*', { count: 'exact', head: true })
          .in('question_id', questionIds)
          .eq('deleted', false);

        // Count resources
        const { count: resourceCount } = await supabase
          .from('resources')
          .select('*', { count: 'exact', head: true })
          .eq('chapter_id', chapterId)
          .eq('deleted', false);

        // Check if bookmarked
        let isBookmarked = false;
        if (user) {
          const { data: bookmarkData } = await supabase
            .from('bookmarks')
            .select('id')
            .eq('user_id', user.id)
            .eq('chapter_id', chapterId)
            .maybeSingle();

          isBookmarked = !!bookmarkData;
        }

        setChapter({
          id: chapterData.id,
          name: chapterData.name,
          questionCount: questionCount || 0,
          answerCount: answerCount || 0,
          resourceCount: resourceCount || 0,
          isBookmarked,
        });

        // Fetch questions with vote counts
        const { data: questionsData } = await supabase
          .from('questions')
          .select('id, data, created_at, type_id')
          .eq('chapter_id', chapterId)
          .eq('deleted', false)
          .order('created_at', { ascending: false });

        // Fetch vote counts and user votes for questions
        const questionsWithVotes = await Promise.all(
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
            };
          })
        );

        setQuestions(questionsWithVotes);

        // Fetch resources with vote counts
        const { data: resourcesData } = await supabase
          .from('resources')
          .select('id, title, description, data, created_at, type_id, devoir_type_id, with_correction')
          .eq('chapter_id', chapterId)
          .eq('deleted', false)
          .order('created_at', { ascending: false });

        // Fetch vote counts and user votes for resources
        const resourcesWithVotes = await Promise.all(
          (resourcesData || []).map(async (resource) => {
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

            let userVote = null;
            if (user) {
              const { data: voteData } = await supabase
                .from('votes')
                .select('vote_type')
                .eq('content_id', resource.id)
                .eq('content_type', 'resource')
                .eq('user_id', user.id)
                .maybeSingle();

              userVote = voteData?.vote_type || null;
            }

            return {
              ...resource,
              upvotes: upvotes || 0,
              downvotes: downvotes || 0,
              userVote,
            };
          })
        );

        setResources(resourcesWithVotes);
      } catch (error) {
        console.error('Error fetching chapter data:', error);
        toast.error(t('errorLoadingChapter') || 'Failed to load chapter');
      } finally {
        setLoading(false);
      }
    };

    fetchChapterData();
  }, [id, user, t]);

  const toggleBookmark = async () => {
    if (!user) {
      toast.error(t('pleaseLogin') || 'Please login to bookmark chapters');
      return;
    }

    if (!chapter) return;

    try {
      if (chapter.isBookmarked) {
        await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('chapter_id', chapter.id);

        setChapter({ ...chapter, isBookmarked: false });
        toast.success(t('bookmarkRemoved') || 'Bookmark removed');
      } else {
        await supabase
          .from('bookmarks')
          .insert({ user_id: user.id, chapter_id: chapter.id });

        setChapter({ ...chapter, isBookmarked: true });
        toast.success(t('bookmarkAdded') || 'Bookmark added');
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      toast.error(t('bookmarkError') || 'Failed to update bookmark');
    }
  };

  const handleVote = async (
    contentId: number,
    contentType: 'question' | 'resource',
    voteType: 'upvote' | 'downvote',
    currentVote: 'upvote' | 'downvote' | null
  ) => {
    if (!user) {
      toast.error(t('pleaseLogin') || 'Please login to vote');
      return;
    }

    try {
      if (currentVote === voteType) {
        // Remove vote
        await supabase
          .from('votes')
          .delete()
          .eq('user_id', user.id)
          .eq('content_id', contentId)
          .eq('content_type', contentType);
      } else {
        // Delete existing vote if any
        await supabase
          .from('votes')
          .delete()
          .eq('user_id', user.id)
          .eq('content_id', contentId)
          .eq('content_type', contentType);

        // Insert new vote
        await supabase
          .from('votes')
          .insert({
            user_id: user.id,
            content_id: contentId,
            content_type: contentType,
            vote_type: voteType,
          });
      }

      // Refresh the data
      if (contentType === 'question') {
        const { data: questionsData } = await supabase
          .from('questions')
          .select('id, data, created_at, type_id')
          .eq('chapter_id', chapter?.id)
          .eq('deleted', false)
          .order('created_at', { ascending: false });

        const questionsWithVotes = await Promise.all(
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

            const { data: voteData } = await supabase
              .from('votes')
              .select('vote_type')
              .eq('content_id', question.id)
              .eq('content_type', 'question')
              .eq('user_id', user.id)
              .maybeSingle();

            return {
              ...question,
              upvotes: upvotes || 0,
              downvotes: downvotes || 0,
              userVote: (voteData?.vote_type as 'upvote' | 'downvote') || null,
            };
          })
        );

        setQuestions(questionsWithVotes);
      } else {
        const { data: resourcesData } = await supabase
          .from('resources')
          .select('id, title, description, data, created_at, type_id, devoir_type_id, with_correction')
          .eq('chapter_id', chapter?.id)
          .eq('deleted', false)
          .order('created_at', { ascending: false });

        const resourcesWithVotes = await Promise.all(
          (resourcesData || []).map(async (resource) => {
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

            return {
              ...resource,
              upvotes: upvotes || 0,
              downvotes: downvotes || 0,
              userVote: (voteData?.vote_type as 'upvote' | 'downvote') || null,
            };
          })
        );

        setResources(resourcesWithVotes);
      }
    } catch (error) {
      console.error('Error voting:', error);
      toast.error(t('voteError') || 'Failed to vote');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-lg font-semibold flex-1">{t('chapter') || 'Chapter'}</h1>
        </div>
        <div className="flex-1 p-4">
          <ContentSkeleton />
        </div>
        <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-lg font-semibold flex-1">{t('chapter') || 'Chapter'}</h1>
        </div>
        <EmptyState
          type="chapters"
          message={t('chapterNotFound') || 'Chapter not found'}
        />
        <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
      </div>
    );
  }

  const hasContent = chapter.questionCount > 0 || chapter.answerCount > 0 || chapter.resourceCount > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      {/* Header with back button */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
        >
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-lg font-semibold flex-1">{t('chapter') || 'Chapter'}</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleBookmark}
        >
          <Bookmark
            size={20}
            className={chapter.isBookmarked ? 'fill-primary' : ''}
            style={chapter.isBookmarked ? { color: '#F6A18A' } : undefined}
          />
        </Button>
      </div>

      {/* Chapter Banner - Reusing chapter card design */}
      <Card 
        className="relative overflow-hidden p-6 m-4 border-none"
        style={{
          background: hasContent 
            ? 'linear-gradient(to right, #FFFFFF 0%, #FDE6E6 100%)' 
            : 'linear-gradient(to right, #FFFFFF 0%, #E0E0E0 100%)',
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
          <h2 className="text-xl font-bold text-foreground mb-4">
            {chapter.name.toUpperCase()}
          </h2>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{t('questions') || 'Questions'}</p>
                <p className="text-base font-semibold text-foreground">{chapter.questionCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{t('answers') || 'Answers'}</p>
                <p className="text-base font-semibold text-foreground">{chapter.answerCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{t('resources') || 'Resources'}</p>
                <p className="text-base font-semibold text-foreground">{chapter.resourceCount}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Content Tabs */}
      <div className="flex-1 px-4">
        <Tabs defaultValue="questions" className="w-full">
          <TabsList className="w-full grid grid-cols-2 mb-4">
            <TabsTrigger value="questions">{t('questions') || 'Questions'}</TabsTrigger>
            <TabsTrigger value="resources">{t('resources') || 'Resources'}</TabsTrigger>
          </TabsList>

          {/* Filters */}
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedTypeFilters.length === 0 ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedTypeFilters([])}
              >
                {t('all') || 'All'}
              </Button>
              {resourceTypes.map((type) => (
                <Button
                  key={type.id}
                  variant={selectedTypeFilters.includes(type.id) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedTypeFilters(prev =>
                      prev.includes(type.id)
                        ? prev.filter(id => id !== type.id)
                        : [...prev, type.id]
                    );
                  }}
                >
                  {type.type}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedDevoirFilters.length === 0 ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDevoirFilters([])}
              >
                {t('allDevoirs') || 'All Types'}
              </Button>
              {devoirTypes.map((type) => (
                <Button
                  key={type.id}
                  variant={selectedDevoirFilters.includes(type.id) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedDevoirFilters(prev =>
                      prev.includes(type.id)
                        ? prev.filter(id => id !== type.id)
                        : [...prev, type.id]
                    );
                  }}
                >
                  {type.devoir_type}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="withCorrection"
                checked={showWithCorrectionOnly}
                onChange={(e) => setShowWithCorrectionOnly(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="withCorrection" className="text-sm">
                {t('withCorrection') || 'Avec correction'}
              </label>
            </div>
          </div>

          <TabsContent value="questions" className="space-y-3">
            <Dialog open={isQuestionDialogOpen} onOpenChange={setIsQuestionDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full mb-4">
                  <Plus className="mr-2 h-4 w-4" />
                  Ask a Question
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Ask a Question</DialogTitle>
                </DialogHeader>
                <AskQuestionForm
                  chapterId={chapter.id}
                  resourceTypes={resourceTypes}
                  onSuccess={() => {
                    setIsQuestionDialogOpen(false);
                    // Refresh data
                    const fetchChapterData = async () => {
                      const { data: questionsData } = await supabase
                        .from('questions')
                        .select('id, data, created_at, type_id')
                        .eq('chapter_id', chapter.id)
                        .eq('deleted', false)
                        .order('created_at', { ascending: false });

                      const questionsWithVotes = await Promise.all(
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
                          };
                        })
                      );

                      setQuestions(questionsWithVotes);
                    };
                    fetchChapterData();
                  }}
                  onCancel={() => setIsQuestionDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>

            {questions.filter(q => 
              (selectedTypeFilters.length === 0 || (q.type_id && selectedTypeFilters.includes(q.type_id)))
            ).length === 0 ? (
              <EmptyState
                type="questions"
                message={t('noQuestions') || 'No questions available yet'}
              />
            ) : (
              questions
                .filter(q => selectedTypeFilters.length === 0 || (q.type_id && selectedTypeFilters.includes(q.type_id)))
                .sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes))
                .map((question) => {
                  const questionType = resourceTypes.find(t => t.id === question.type_id);
                  return (
                <Card key={question.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-foreground flex-1">{question.data}</p>
                    {questionType && (
                      <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full ml-2">
                        {questionType.type}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {new Date(question.created_at).toLocaleDateString()}
                    </p>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleVote(question.id, 'question', 'upvote', question.userVote)}
                        className="flex items-center gap-1.5 transition-colors hover:text-green-600"
                      >
                        <ThumbsUp
                          size={16}
                          className={question.userVote === 'upvote' ? 'fill-green-600 text-green-600' : ''}
                        />
                        <span className="text-sm font-medium">{question.upvotes}</span>
                      </button>
                      <button
                        onClick={() => handleVote(question.id, 'question', 'downvote', question.userVote)}
                        className="flex items-center gap-1.5 transition-colors hover:text-red-600"
                      >
                        <ThumbsDown
                          size={16}
                          className={question.userVote === 'downvote' ? 'fill-red-600 text-red-600' : ''}
                        />
                        <span className="text-sm font-medium">{question.downvotes}</span>
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })
            )}
          </TabsContent>

          <TabsContent value="resources" className="space-y-3">
            <Dialog open={isResourceDialogOpen} onOpenChange={setIsResourceDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full mb-4">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Resource
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add a Resource</DialogTitle>
                </DialogHeader>
                <AddResourceForm
                  chapterId={chapter.id}
                  subjectId={subjectId || 0}
                  resourceTypes={resourceTypes}
                  devoirTypes={devoirTypes}
                  onSuccess={() => {
                    setIsResourceDialogOpen(false);
                    // Refresh data
                    const fetchResources = async () => {
                      const { data: resourcesData } = await supabase
                        .from('resources')
                        .select('id, title, description, data, created_at, type_id, devoir_type_id, with_correction')
                        .eq('chapter_id', chapter.id)
                        .eq('deleted', false)
                        .order('created_at', { ascending: false });

                      const resourcesWithVotes = await Promise.all(
                        (resourcesData || []).map(async (resource) => {
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

                          let userVote = null;
                          if (user) {
                            const { data: voteData } = await supabase
                              .from('votes')
                              .select('vote_type')
                              .eq('content_id', resource.id)
                              .eq('content_type', 'resource')
                              .eq('user_id', user.id)
                              .maybeSingle();

                            userVote = voteData?.vote_type || null;
                          }

                          return {
                            ...resource,
                            upvotes: upvotes || 0,
                            downvotes: downvotes || 0,
                            userVote,
                          };
                        })
                      );

                      setResources(resourcesWithVotes);
                    };
                    fetchResources();
                  }}
                  onCancel={() => setIsResourceDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>

            {resources.filter(r => 
              (selectedTypeFilters.length === 0 || selectedTypeFilters.includes(r.type_id)) &&
              (selectedDevoirFilters.length === 0 || (r.devoir_type_id && selectedDevoirFilters.includes(r.devoir_type_id))) &&
              (!showWithCorrectionOnly || r.with_correction)
            ).length === 0 ? (
              <EmptyState
                type="resources"
                message={t('noResources') || 'No resources available yet'}
              />
            ) : (
              resources
                .filter(r => 
                  (selectedTypeFilters.length === 0 || selectedTypeFilters.includes(r.type_id)) &&
                  (selectedDevoirFilters.length === 0 || (r.devoir_type_id && selectedDevoirFilters.includes(r.devoir_type_id))) &&
                  (!showWithCorrectionOnly || r.with_correction)
                )
                .sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes))
                .map((resource) => {
                  const resourceType = resourceTypes.find(t => t.id === resource.type_id);
                  const devoirType = devoirTypes.find(t => t.id === resource.devoir_type_id);
                  return (
                <Card key={resource.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-foreground flex-1">{resource.title}</h3>
                    <div className="flex gap-1 ml-2">
                      {resourceType && (
                        <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                          {resourceType.type}
                        </span>
                      )}
                      {devoirType && (
                        <span className="text-xs px-2 py-1 bg-secondary/10 text-secondary-foreground rounded-full">
                          {devoirType.devoir_type}
                        </span>
                      )}
                      {resource.with_correction && (
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                          {t('withCorrection') || 'Avec correction'}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{resource.description}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {new Date(resource.created_at).toLocaleDateString()}
                    </p>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleVote(resource.id, 'resource', 'upvote', resource.userVote)}
                        className="flex items-center gap-1.5 transition-colors hover:text-green-600"
                      >
                        <ThumbsUp
                          size={16}
                          className={resource.userVote === 'upvote' ? 'fill-green-600 text-green-600' : ''}
                        />
                        <span className="text-sm font-medium">{resource.upvotes}</span>
                      </button>
                      <button
                        onClick={() => handleVote(resource.id, 'resource', 'downvote', resource.userVote)}
                        className="flex items-center gap-1.5 transition-colors hover:text-red-600"
                      >
                        <ThumbsDown
                          size={16}
                          className={resource.userVote === 'downvote' ? 'fill-red-600 text-red-600' : ''}
                        />
                        <span className="text-sm font-medium">{resource.downvotes}</span>
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })
            )}
          </TabsContent>
        </Tabs>
      </div>

      <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
    </div>
  );
}
