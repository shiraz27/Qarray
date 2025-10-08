import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { MessageSquare, FileText, Bookmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import chapterPattern from '@/assets/chapter-pattern.png';
import { Header } from '@/components/Header';
import { BottomNavigation } from '@/components/BottomNavigation';
import { BookmarkSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';

interface BookmarkedChapter {
  id: number;
  name: string;
  questionCount: number;
  answerCount: number;
  resourceCount: number;
  subjectName: string;
}

export default function Bookmarks() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [chapters, setChapters] = useState<BookmarkedChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('bookmarks');

  const handleTabChange = (tab: string) => {
    if (tab === 'subjects') {
      navigate('/');
    } else {
      setActiveTab(tab);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (!user) {
        navigate('/login');
      }
    });
  }, [navigate]);

  useEffect(() => {
    const fetchBookmarkedChapters = async () => {
      if (!user) return;

      setLoading(true);
      try {
        // Fetch bookmarked chapter IDs
        const { data: bookmarksData, error: bookmarksError } = await supabase
          .from('bookmarks')
          .select('chapter_id')
          .eq('user_id', user.id);

        if (bookmarksError) throw bookmarksError;

        const chapterIds = bookmarksData?.map(b => b.chapter_id) || [];

        if (chapterIds.length === 0) {
          setChapters([]);
          setLoading(false);
          return;
        }

        // Fetch chapter details with subject names
        const { data: chaptersData, error: chaptersError } = await supabase
          .from('chapters')
          .select('id, name, subject_id, subjects(name)')
          .in('id', chapterIds)
          .eq('deleted', false);

        if (chaptersError) throw chaptersError;

        // Fetch counts for each chapter
        const chaptersWithCounts = await Promise.all(
          (chaptersData || []).map(async (chapter: any) => {
            // Count questions
            const { count: questionCount } = await supabase
              .from('questions')
              .select('*', { count: 'exact', head: true })
              .eq('chapter_id', chapter.id)
              .eq('deleted', false);

            // Count answers
            const { count: answerCount } = await supabase
              .from('answers')
              .select('*', { count: 'exact', head: true })
              .in('question_id', 
                await supabase
                  .from('questions')
                  .select('id')
                  .eq('chapter_id', chapter.id)
                  .eq('deleted', false)
                  .then(res => res.data?.map(q => q.id) || [])
              )
              .eq('deleted', false);

            // Count resources
            const { count: resourceCount } = await supabase
              .from('resources')
              .select('*', { count: 'exact', head: true })
              .eq('chapter_id', chapter.id)
              .eq('deleted', false);

            return {
              id: chapter.id,
              name: chapter.name,
              questionCount: questionCount || 0,
              answerCount: answerCount || 0,
              resourceCount: resourceCount || 0,
              subjectName: chapter.subjects?.name || '',
            };
          })
        );

        setChapters(chaptersWithCounts);
      } catch (error) {
        console.error('Error fetching bookmarked chapters:', error);
        toast.error(t('errorLoadingBookmarks') || 'Failed to load bookmarks');
      } finally {
        setLoading(false);
      }
    };

    fetchBookmarkedChapters();
  }, [user, t]);

  const removeBookmark = async (chapterId: number) => {
    if (!user) return;

    try {
      await supabase
        .from('bookmarks')
        .delete()
        .eq('user_id', user.id)
        .eq('chapter_id', chapterId);

      setChapters(prev => prev.filter(ch => ch.id !== chapterId));
      toast.success(t('bookmarkRemoved') || 'Bookmark removed');
    } catch (error) {
      console.error('Error removing bookmark:', error);
      toast.error(t('bookmarkError') || 'Failed to remove bookmark');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 w-full px-4 pb-4 mb-24 mt-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">
          {t('bookmarks') || 'Bookmarks'}
        </h1>

        {loading ? (
          <BookmarkSkeleton />
        ) : chapters.length === 0 ? (
          <EmptyState
            type="bookmarks"
            message={t('noBookmarks') || "You haven't bookmarked any chapters yet"}
          />
        ) : (
          <div className="space-y-3">
            {chapters.map((chapter) => {
              const hasContent = chapter.questionCount > 0 || chapter.answerCount > 0 || chapter.resourceCount > 0;
              
              return (
                <Card 
                  key={chapter.id}
                  className="relative overflow-hidden p-4 hover:shadow-md transition-all cursor-pointer border-none"
                  style={{
                    background: hasContent 
                      ? 'linear-gradient(to right, #FFFFFF 0%, #FDE6E6 100%)' 
                      : 'linear-gradient(to right, #FFFFFF 0%, #E0E0E0 100%)',
                  }}
                  onClick={() => navigate(`/chapter/${chapter.id}`)}
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
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground mb-1">{chapter.subjectName}</p>
                        <h3 className="font-semibold text-sm tracking-wide text-foreground">
                          {chapter.name.toUpperCase()}
                        </h3>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBookmark(chapter.id);
                        }}
                        className="hover:scale-110 transition-transform"
                      >
                        <Bookmark
                          size={20}
                          className="text-foreground fill-foreground"
                        />
                      </button>
                    </div>
                    
                    <div className="flex gap-4 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MessageSquare size={14} className="text-muted-foreground" />
                        <span className="font-medium">
                          {chapter.questionCount} {t('questions') || 'Questions'}/ {chapter.answerCount} {t('answers') || 'Answers'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <FileText size={14} className="text-muted-foreground" />
                        <span className="font-medium">
                          {chapter.resourceCount} {t('resources') || 'Resources'}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
    </div>
  );
}
