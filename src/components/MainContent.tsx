import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { MessageSquare, FileText, Bookmark, Plus, Edit } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import chapterPattern from '@/assets/chapter-pattern.png';
import { ChapterSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { MemorizationsList } from '@/components/MemorizationsList';
import { ManageChapterDialog } from '@/components/ManageChapterDialog';
import { useUserRole } from '@/hooks/useUserRole';

interface Chapter {
  id: number;
  name: string;
  questionCount: number;
  answerCount: number;
  resourceCount: number;
  isBookmarked: boolean;
}

interface CommonChapter {
  id: number;
  name: string;
  className: string;
}

const BAC_CLASS_IDS = new Set([15, 16, 17, 18, 19, 20, 21]);

interface MainContentProps {
  subjectId: number | null;
}

export const MainContent: React.FC<MainContentProps> = ({ subjectId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [commonChapters, setCommonChapters] = useState<CommonChapter[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<number | null>(null);
  const [classId, setClassId] = useState<number | null>(null);
  const { isModerator, isAdmin } = useUserRole();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  useEffect(() => {
    const fetchChapters = async () => {
      if (!subjectId) return;

      setLoading(true);
      try {
        // Fetch subject to get class_id
        const { data: subjectData } = await supabase
          .from('subjects')
          .select('class_id')
          .eq('id', subjectId)
          .maybeSingle();

        if (subjectData) {
          setClassId(subjectData.class_id);
        }

        // Fetch chapters
        const { data: chaptersData, error: chaptersError } = await supabase
          .from('chapters')
          .select('id, name')
          .eq('subject_id', subjectId)
          .eq('deleted', false)
          .order('name');

        if (chaptersError) throw chaptersError;

        // Fetch user's bookmarks if logged in
        let bookmarkedChapterIds: number[] = [];
        if (user) {
          const { data: bookmarksData } = await supabase
            .from('bookmarks')
            .select('chapter_id')
            .eq('user_id', user.id);
          bookmarkedChapterIds = bookmarksData?.map(b => b.chapter_id) || [];
        }

        // Fetch counts for each chapter
        const chaptersWithCounts = await Promise.all(
          (chaptersData || []).map(async (chapter) => {
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
              isBookmarked: bookmarkedChapterIds.includes(chapter.id),
            };
          })
        );

        setChapters(chaptersWithCounts);

        // Fetch common chapters from other Bac classes
        const currentClassId = subjectData?.class_id;
        const nativeIds = (chaptersData || []).map((c) => c.id);
        if (
          currentClassId &&
          BAC_CLASS_IDS.has(currentClassId) &&
          nativeIds.length > 0
        ) {
          const { data: mappings } = await supabase
            .from('chapter_common_mappings')
            .select(
              'common_chapter_id, chapters!chapter_common_mappings_common_chapter_id_fkey(id, name, class_id, deleted, classes(name))'
            )
            .in('chapter_id', nativeIds);

          // Fallback: the FK alias may not exist; do a manual join.
          let commons: CommonChapter[] = [];
          if (mappings && mappings.length > 0 && (mappings[0] as any).chapters) {
            const seen = new Set<number>();
            for (const m of mappings as any[]) {
              const ch = m.chapters;
              if (!ch || ch.deleted) continue;
              if (seen.has(ch.id)) continue;
              seen.add(ch.id);
              commons.push({
                id: ch.id,
                name: ch.name,
                className: ch.classes?.name ?? '',
              });
            }
          } else {
            // Manual join fallback
            const { data: rawMappings } = await supabase
              .from('chapter_common_mappings')
              .select('common_chapter_id')
              .in('chapter_id', nativeIds);
            const targetIds = Array.from(
              new Set((rawMappings || []).map((r: any) => r.common_chapter_id))
            );
            if (targetIds.length > 0) {
              const { data: chRows } = await supabase
                .from('chapters')
                .select('id, name, class_id, deleted, classes(name)')
                .in('id', targetIds)
                .eq('deleted', false);
              commons = (chRows || []).map((ch: any) => ({
                id: ch.id,
                name: ch.name,
                className: ch.classes?.name ?? '',
              }));
            }
          }
          setCommonChapters(commons);
        } else {
          setCommonChapters([]);
        }
      } catch (error) {
        console.error('Error fetching chapters:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChapters();
  }, [subjectId, user]);

  const toggleBookmark = async (chapterId: number, currentlyBookmarked: boolean) => {
    if (!user) {
      toast.error(t('pleaseLogin') || 'Please login to bookmark chapters');
      return;
    }

    try {
      if (currentlyBookmarked) {
        await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('chapter_id', chapterId);

        setChapters(prev => prev.map(ch =>
          ch.id === chapterId ? { ...ch, isBookmarked: false } : ch
        ));
        toast.success(t('bookmarkRemoved') || 'Bookmark removed');
      } else {
        await supabase
          .from('bookmarks')
          .insert({ user_id: user.id, chapter_id: chapterId });

        setChapters(prev => prev.map(ch =>
          ch.id === chapterId ? { ...ch, isBookmarked: true } : ch
        ));
        toast.success(t('bookmarkAdded') || 'Bookmark added');
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      toast.error(t('bookmarkError') || 'Failed to update bookmark');
    }
  };

  const handleAddChapter = () => {
    setEditingChapterId(null);
    setManageDialogOpen(true);
  };

  const handleEditChapter = (chapterId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChapterId(chapterId);
    setManageDialogOpen(true);
  };

  const handleDialogClose = () => {
    setManageDialogOpen(false);
    setEditingChapterId(null);
  };

  const handleSuccess = () => {
    // Refetch chapters
    const refetch = async () => {
      if (!subjectId) return;
      
      setLoading(true);
      try {
        const { data: chaptersData, error: chaptersError } = await supabase
          .from('chapters')
          .select('id, name')
          .eq('subject_id', subjectId)
          .eq('deleted', false)
          .order('name');

        if (chaptersError) throw chaptersError;

        let bookmarkedChapterIds: number[] = [];
        if (user) {
          const { data: bookmarksData } = await supabase
            .from('bookmarks')
            .select('chapter_id')
            .eq('user_id', user.id);
          bookmarkedChapterIds = bookmarksData?.map(b => b.chapter_id) || [];
        }

        const chaptersWithCounts = await Promise.all(
          (chaptersData || []).map(async (chapter) => {
            const { count: questionCount } = await supabase
              .from('questions')
              .select('*', { count: 'exact', head: true })
              .eq('chapter_id', chapter.id)
              .eq('deleted', false);

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
              isBookmarked: bookmarkedChapterIds.includes(chapter.id),
            };
          })
        );

        setChapters(chaptersWithCounts);
      } catch (error) {
        console.error('Error fetching chapters:', error);
      } finally {
        setLoading(false);
      }
    };
    refetch();
  };

  if (!subjectId) {
    return (
      <main className="w-full px-4 pb-4">
        <div className="text-center py-8 text-gray-500">
          {t('selectSubject') || 'Select a subject to view chapters'}
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="w-full px-4 pb-4 mt-4">
        <ChapterSkeleton />
      </main>
    );
  }

  if (chapters.length === 0) {
    return (
      <main className="w-full px-4 pb-4">
        {(isModerator || isAdmin) && (
          <div className="mt-4">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleAddChapter}
            >
              <Plus size={20} />
              Add Chapter
            </Button>
          </div>
        )}
        <EmptyState
          type="chapters"
          message={t('noChapters') || 'No chapters available for this subject'}
        />
        {subjectId && classId && (
          <ManageChapterDialog
            open={manageDialogOpen}
            onClose={handleDialogClose}
            subjectId={subjectId}
            classId={classId}
            chapterId={editingChapterId}
            onSuccess={handleSuccess}
          />
        )}
      </main>
    );
  }

  return (
    <main className="w-full pb-4 mb-24">
      <MemorizationsList subjectId={subjectId} />
      
      <div className="space-y-3 mt-4 px-4">
        {(isModerator || isAdmin) && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleAddChapter}
          >
            <Plus size={20} />
            Add Chapter
          </Button>
        )}
        {chapters.map((chapter) => {
          const hasContent = chapter.questionCount > 0 || chapter.answerCount > 0 || chapter.resourceCount > 0;
          
          return (
            <Card 
              key={chapter.id}
              className="relative overflow-hidden p-4 hover:shadow-md transition-all cursor-pointer border-none group"
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
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm tracking-wide text-gray-900 flex-1">
                    {chapter.name.toUpperCase()}
                  </h3>
                  <div className="flex items-center gap-2">
                    {(isModerator || isAdmin) && (
                      <button
                        onClick={(e) => handleEditChapter(chapter.id, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                        title="Edit Chapter"
                      >
                        <Edit size={16} className="text-gray-700" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBookmark(chapter.id, chapter.isBookmarked);
                      }}
                      className="hover:scale-110 transition-transform"
                    >
                      <Bookmark
                        size={20}
                        className={`text-gray-700 ${chapter.isBookmarked ? 'fill-gray-700' : ''}`}
                      />
                    </button>
                  </div>
                </div>
                
                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <MessageSquare size={14} className="text-gray-600" />
                    <span className="font-medium">
                      {chapter.questionCount} {t('questions') || 'Questions'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <FileText size={14} className="text-gray-600" />
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

      {subjectId && classId && (
        <ManageChapterDialog
          open={manageDialogOpen}
          onClose={handleDialogClose}
          subjectId={subjectId}
          classId={classId}
          chapterId={editingChapterId}
          onSuccess={handleSuccess}
        />
      )}
    </main>
  );
};
