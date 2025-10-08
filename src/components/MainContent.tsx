import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { BookOpen, MessageSquare, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
    <main className="w-full px-4 pb-4 mb-20">
      <div className="space-y-3 mt-4">
        {chapters.map((chapter) => (
          <Card 
            key={chapter.id}
            className="p-4 hover:shadow-md transition-shadow cursor-pointer"
          >
            <h3 className="font-semibold text-lg mb-3 text-gray-800">
              {chapter.name}
            </h3>
            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <MessageSquare size={16} className="text-blue-500" />
                <span>{chapter.questionCount} {t('questions') || 'questions'}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <BookOpen size={16} className="text-green-500" />
                <span>{chapter.answerCount} {t('answers') || 'answers'}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <FileText size={16} className="text-purple-500" />
                <span>{chapter.resourceCount} {t('resources') || 'resources'}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
};
