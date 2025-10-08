import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { BookOpen, MessageSquare, FileText, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import chapterPattern from '@/assets/chapter-pattern.png';

interface Chapter {
  id: number;
  name: string;
  questionCount: number;
  answerCount: number;
  resourceCount: number;
}

interface MainContentProps {
  subjectId: number | null;
}

export const MainContent: React.FC<MainContentProps> = ({ subjectId }) => {
  const { t } = useTranslation();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchChapters = async () => {
      if (!subjectId) return;

      setLoading(true);
      try {
        // Fetch chapters
        const { data: chaptersData, error: chaptersError } = await supabase
          .from('chapters')
          .select('id, name')
          .eq('subject_id', subjectId)
          .eq('deleted', false)
          .order('name');

        if (chaptersError) throw chaptersError;

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

    fetchChapters();
  }, [subjectId]);

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
      <main className="w-full px-4 pb-4">
        <div className="text-center py-8 text-gray-500">
          {t('loading') || 'Loading...'}
        </div>
      </main>
    );
  }

  if (chapters.length === 0) {
    return (
      <main className="w-full px-4 pb-4">
        <div className="text-center py-8 text-gray-500">
          {t('noChapters') || 'No chapters available for this subject'}
        </div>
      </main>
    );
  }

  return (
    <main className="w-full px-4 pb-4 mb-24">
      <div className="space-y-3 mt-4">
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
                <div className="flex items-center gap-2 mb-3">
                  {hasContent && (
                    <Star size={20} className="text-foreground fill-foreground" />
                  )}
                  <h3 className="font-semibold text-sm tracking-wide text-foreground flex-1">
                    {chapter.name.toUpperCase()}
                  </h3>
                </div>
                
                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MessageSquare size={14} className="text-muted-foreground" />
                    <span className="font-medium">
                      {chapter.questionCount} {t('questions') || 'Questions'}/ {t('answers') || 'Answers'}
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
    </main>
  );
};
