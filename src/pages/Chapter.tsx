import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, FileText, ArrowLeft, Bookmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import chapterPattern from '@/assets/chapter-pattern.png';
import { BottomNavigation } from '@/components/BottomNavigation';

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
}

interface Resource {
  id: number;
  title: string;
  description: string;
  data: string[];
  created_at: string;
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
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
          .select('id, name')
          .eq('id', chapterId)
          .eq('deleted', false)
          .single();

        if (chapterError) throw chapterError;

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

        // Fetch questions
        const { data: questionsData } = await supabase
          .from('questions')
          .select('id, data, created_at')
          .eq('chapter_id', chapterId)
          .eq('deleted', false)
          .order('created_at', { ascending: false });

        setQuestions(questionsData || []);

        // Fetch resources
        const { data: resourcesData } = await supabase
          .from('resources')
          .select('id, title, description, data, created_at')
          .eq('chapter_id', chapterId)
          .eq('deleted', false)
          .order('created_at', { ascending: false });

        setResources(resourcesData || []);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">{t('loading') || 'Loading...'}</div>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">{t('chapterNotFound') || 'Chapter not found'}</div>
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
          onClick={() => navigate(-1)}
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
            className={chapter.isBookmarked ? 'fill-foreground' : ''}
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
          
          <div className="flex gap-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MessageSquare size={18} />
              <div>
                <p className="text-xs">{t('questions') || 'Questions'}</p>
                <p className="text-lg font-semibold text-foreground">{chapter.questionCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MessageSquare size={18} />
              <div>
                <p className="text-xs">{t('answers') || 'Answers'}</p>
                <p className="text-lg font-semibold text-foreground">{chapter.answerCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileText size={18} />
              <div>
                <p className="text-xs">{t('resources') || 'Resources'}</p>
                <p className="text-lg font-semibold text-foreground">{chapter.resourceCount}</p>
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

          <TabsContent value="questions" className="space-y-3">
            {questions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('noQuestions') || 'No questions yet'}
              </div>
            ) : (
              questions.map((question) => (
                <Card key={question.id} className="p-4">
                  <p className="text-foreground">{question.data}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(question.created_at).toLocaleDateString()}
                  </p>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="resources" className="space-y-3">
            {resources.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('noResources') || 'No resources yet'}
              </div>
            ) : (
              resources.map((resource) => (
                <Card key={resource.id} className="p-4">
                  <h3 className="font-semibold text-foreground mb-2">{resource.title}</h3>
                  <p className="text-sm text-muted-foreground mb-2">{resource.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(resource.created_at).toLocaleDateString()}
                  </p>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      
    </div>
  );
}
