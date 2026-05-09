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
import { MessageSquare, FileText, Bookmark, Plus, Edit, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import chapterPattern from '@/assets/chapter-pattern.png';
import { ChapterSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { MemorizationsList } from '@/components/MemorizationsList';
import { ManageChapterDialog } from '@/components/ManageChapterDialog';
import { PageCountBadge } from '@/components/PageCountBadge';
import { useUserRole } from '@/hooks/useUserRole';

interface Chapter {
  id: number;
  name: string;
  questionCount: number;
  answerCount: number;
  resourceCount: number;
  pageCount: number;
  isBookmarked: boolean;
}

interface CommonChapter {
  id: number;
  name: string;
  className: string;
  matchedNativeId: number | null;
  questionCount: number;
  answerCount: number;
  resourceCount: number;
  pageCount: number;
}

const BAC_CLASS_IDS = new Set([15, 16, 17, 18, 19, 20, 21]);

interface MainContentProps {
  subjectId: number | null;
  viewingClassId?: number | null;
}

export const MainContent: React.FC<MainContentProps> = ({ subjectId, viewingClassId = null }) => {
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
  const [filterResources, setFilterResources] = useState(false);
  const [filterQuestions, setFilterQuestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

        // For common subjects (class_id is null), fall back to the viewing class
        const effectiveClassId = subjectData?.class_id ?? viewingClassId;
        setClassId(effectiveClassId);

        // Fetch chapters
        const { data: chaptersData, error: chaptersError } = await supabase
          .from('chapters')
          .select('id, name')
          .eq('subject_id', subjectId)
          .eq('deleted', false)
          .order('id', { ascending: true });

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

            // Sum page_count from resources + questions
            const [{ data: resPages }, { data: qPages }] = await Promise.all([
              supabase
                .from('resources')
                .select('page_count')
                .eq('chapter_id', chapter.id)
                .eq('deleted', false),
              supabase
                .from('questions')
                .select('page_count')
                .eq('chapter_id', chapter.id)
                .eq('deleted', false),
            ]);
            const pageCount =
              (resPages || []).reduce((s, r: any) => s + (r.page_count || 0), 0) +
              (qPages || []).reduce((s, r: any) => s + (r.page_count || 0), 0);

            return {
              id: chapter.id,
              name: chapter.name,
              questionCount: questionCount || 0,
              answerCount: answerCount || 0,
              resourceCount: resourceCount || 0,
              pageCount,
              isBookmarked: bookmarkedChapterIds.includes(chapter.id),
            };
          })
        );

        const sortedChapters = [...chaptersWithCounts].sort((a, b) => {
          const aGen = a.name.trim().toLowerCase() === 'chapitre général' ? 0 : 1;
          const bGen = b.name.trim().toLowerCase() === 'chapitre général' ? 0 : 1;
          return aGen - bGen;
        });
        setChapters(sortedChapters);

        // Fetch common chapters from other Bac classes
        const currentClassId = subjectData?.class_id;
        const nativeIds = (chaptersData || []).map((c) => c.id);
        if (
          currentClassId &&
          BAC_CLASS_IDS.has(currentClassId) &&
          nativeIds.length > 0
        ) {
          const { data: rawMappings } = await supabase
            .from('chapter_common_mappings')
            .select('chapter_id, common_chapter_id')
            .in('chapter_id', nativeIds);
          // Build common -> matched native map (lowest native id wins for determinism)
          const commonToNative = new Map<number, number>();
          (rawMappings || []).forEach((r: any) => {
            const existing = commonToNative.get(r.common_chapter_id);
            if (existing === undefined || r.chapter_id < existing) {
              commonToNative.set(r.common_chapter_id, r.chapter_id);
            }
          });
          const targetIds = Array.from(commonToNative.keys());
          let commons: CommonChapter[] = [];
          if (targetIds.length > 0) {
            const { data: chRows } = await supabase
              .from('chapters')
              .select('id, name, class_id, deleted, classes(name)')
              .in('id', targetIds)
              .eq('deleted', false);
            // native id ordering map (curriculum order)
            const nativeOrder = new Map<number, number>();
            (chaptersData || []).forEach((c, idx) => nativeOrder.set(c.id, idx));
            commons = await Promise.all(
              (chRows || []).map(async (ch: any) => {
                const { count: questionCount } = await supabase
                  .from('questions')
                  .select('*', { count: 'exact', head: true })
                  .eq('chapter_id', ch.id)
                  .eq('deleted', false);
                const qIds = await supabase
                  .from('questions')
                  .select('id')
                  .eq('chapter_id', ch.id)
                  .eq('deleted', false)
                  .then((res) => res.data?.map((q) => q.id) || []);
                const { count: answerCount } = await supabase
                  .from('answers')
                  .select('*', { count: 'exact', head: true })
                  .in('question_id', qIds)
                  .eq('deleted', false);
                const { count: resourceCount } = await supabase
                  .from('resources')
                  .select('*', { count: 'exact', head: true })
                  .eq('chapter_id', ch.id)
                  .eq('deleted', false);
                const [{ data: resPages }, { data: qPages }] = await Promise.all([
                  supabase
                    .from('resources')
                    .select('page_count')
                    .eq('chapter_id', ch.id)
                    .eq('deleted', false),
                  supabase
                    .from('questions')
                    .select('page_count')
                    .eq('chapter_id', ch.id)
                    .eq('deleted', false),
                ]);
                const pageCount =
                  (resPages || []).reduce((s, r: any) => s + (r.page_count || 0), 0) +
                  (qPages || []).reduce((s, r: any) => s + (r.page_count || 0), 0);
                return {
                  id: ch.id,
                  name: ch.name,
                  className: ch.classes?.name ?? '',
                  matchedNativeId: commonToNative.get(ch.id) ?? null,
                  questionCount: questionCount || 0,
                  answerCount: answerCount || 0,
                  resourceCount: resourceCount || 0,
                  pageCount,
                };
              })
            );
            commons.sort((a, b) => {
              const aOrder = a.matchedNativeId !== null
                ? nativeOrder.get(a.matchedNativeId) ?? Number.MAX_SAFE_INTEGER
                : Number.MAX_SAFE_INTEGER;
              const bOrder = b.matchedNativeId !== null
                ? nativeOrder.get(b.matchedNativeId) ?? Number.MAX_SAFE_INTEGER
                : Number.MAX_SAFE_INTEGER;
              if (aOrder !== bOrder) return aOrder - bOrder;
              return a.id - b.id;
            });
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

            const [{ data: resPages }, { data: qPages }] = await Promise.all([
              supabase
                .from('resources')
                .select('page_count')
                .eq('chapter_id', chapter.id)
                .eq('deleted', false),
              supabase
                .from('questions')
                .select('page_count')
                .eq('chapter_id', chapter.id)
                .eq('deleted', false),
            ]);
            const pageCount =
              (resPages || []).reduce((s, r: any) => s + (r.page_count || 0), 0) +
              (qPages || []).reduce((s, r: any) => s + (r.page_count || 0), 0);

            return {
              id: chapter.id,
              name: chapter.name,
              questionCount: questionCount || 0,
              answerCount: answerCount || 0,
              resourceCount: resourceCount || 0,
              pageCount,
              isBookmarked: bookmarkedChapterIds.includes(chapter.id),
            };
          })
        );

        const sortedChapters = [...chaptersWithCounts].sort((a, b) => {
          const aGen = a.name.trim().toLowerCase() === 'chapitre général' ? 0 : 1;
          const bGen = b.name.trim().toLowerCase() === 'chapitre général' ? 0 : 1;
          return aGen - bGen;
        });
        setChapters(sortedChapters);
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
          const isGeneral = chapter.name.trim().toLowerCase() === 'chapitre général';

          return (
            <Card 
              key={chapter.id}
              className="relative overflow-hidden p-4 hover:shadow-md transition-all cursor-pointer border-none group"
              style={{
                background: isGeneral
                  ? 'linear-gradient(to right, #FFF8DC 0%, #F5C542 100%)'
                  : hasContent
                  ? 'linear-gradient(to right, #FFFFFF 0%, #FDE6E6 100%)'
                  : 'linear-gradient(to right, #FFFFFF 0%, #E0E0E0 100%)',
                boxShadow: isGeneral ? '0 2px 12px rgba(212, 160, 23, 0.35)' : undefined,
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

      {commonChapters.length > 0 && (
        <div className="mt-6 px-4">
          <Accordion type="single" collapsible defaultValue="common">
            <AccordionItem value="common" className="border rounded-lg bg-card">
              <AccordionTrigger className="px-4 hover:no-underline">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  Common Chapters from other Bac classes
                  <Badge variant="secondary">{commonChapters.length}</Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {/* Filters and Search */}
                <div className="space-y-3 mb-4">
                  {/* Search Input */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search chapters..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-10 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {/* Filter Toggles */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFilterResources(!filterResources)}
                      className={`flex-1 px-3 py-2 text-xs font-medium rounded-full border-2 transition-all ${
                        filterResources
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-border hover:border-primary'
                      }`}
                    >
                      <FileText size={14} className="inline mr-1" />
                      Has Resources
                    </button>
                    <button
                      onClick={() => setFilterQuestions(!filterQuestions)}
                      className={`flex-1 px-3 py-2 text-xs font-medium rounded-full border-2 transition-all ${
                        filterQuestions
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-border hover:border-primary'
                      }`}
                    >
                      <MessageSquare size={14} className="inline mr-1" />
                      Has Questions
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {commonChapters
                    .filter((ch) => {
                      // Apply search filter (fuzzy search by name)
                      if (searchQuery) {
                        const query = searchQuery.toLowerCase();
                        const name = ch.name.toLowerCase();
                        // Simple fuzzy match: check if all characters in query exist in name in order
                        let queryIndex = 0;
                        for (const char of name) {
                          if (char === query[queryIndex]) {
                            queryIndex++;
                            if (queryIndex === query.length) break;
                          }
                        }
                        if (queryIndex < query.length) return false;
                      }

                      // Apply resource filter
                      if (filterResources && ch.resourceCount === 0) return false;

                      // Apply questions filter
                      if (filterQuestions && ch.questionCount === 0) return false;

                      return true;
                    })
                    .map((ch, idx) => {
                    const prev = idx > 0 ? commonChapters[idx - 1] : null;
                    const isNewCluster =
                      !prev || prev.matchedNativeId !== ch.matchedNativeId;
                    const nativeName = ch.matchedNativeId
                      ? chapters.find((c) => c.id === ch.matchedNativeId)?.name
                      : null;
                    return (
                      <React.Fragment key={ch.id}>
                        {isNewCluster && idx > 0 && (
                          <div className="flex items-center gap-2 pt-2">
                            <div className="h-px flex-1 bg-border" />
                            {nativeName && (
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                Similar to: {nativeName}
                              </span>
                            )}
                            <div className="h-px flex-1 bg-border" />
                          </div>
                        )}
                    <Card
                      className="relative overflow-hidden p-4 hover:shadow-md transition-all cursor-pointer border-none"
                      style={{
                        background:
                          ch.questionCount > 0 || ch.answerCount > 0 || ch.resourceCount > 0
                            ? 'linear-gradient(to right, #FFFFFF 0%, #B3D4FC 100%)'
                            : 'linear-gradient(to right, #FFFFFF 0%, #E8F0FE 100%)',
                      }}
                      onClick={() => navigate(`/chapter/${ch.id}`)}
                    >
                      <div
                        className="absolute inset-0 opacity-30"
                        style={{
                          backgroundImage: `url(${chapterPattern})`,
                          backgroundSize: 'auto',
                          backgroundRepeat: 'repeat',
                          imageRendering: 'crisp-edges',
                        }}
                      />
                      <div className="relative z-10">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <h3 className="font-semibold text-sm tracking-wide text-gray-900 flex-1">
                            {ch.name.toUpperCase()}
                          </h3>
                          <Badge
                            variant="outline"
                            className="bg-white/70 text-gray-700 border-gray-300 whitespace-nowrap"
                          >
                            From {ch.className}
                          </Badge>
                        </div>
                        <div className="flex gap-4 text-xs">
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <MessageSquare size={14} className="text-gray-600" />
                            <span className="font-medium">
                              {ch.questionCount} {t('questions') || 'Questions'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-600">
                            <FileText size={14} className="text-gray-600" />
                            <span className="font-medium">
                              {ch.resourceCount} {t('resources') || 'Resources'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                      </React.Fragment>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}

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
