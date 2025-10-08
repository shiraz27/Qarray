import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
        <div className="flex justify-center mt-8">
          <img
            src="https://api.builder.io/api/v1/image/assets/a6410069d4c34ccabf25d52a6064b0e1/3dbba9d5c0d85524fea10b037f6537bc93b685cb?placeholderIfAbsent=true"
            className="aspect-[0.96] object-contain w-full max-w-md"
            alt="Select a subject"
          />
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="w-full px-4 pb-4">
        <div className="text-center py-8 text-[#9E9E9E]">
          {t('loading') || 'Loading...'}
        </div>
      </main>
    );
  }

  if (chapters.length === 0) {
    return (
      <main className="w-full px-4 pb-4">
        <div className="text-center py-8 text-[#9E9E9E]">
          {t('noChapters') || 'No chapters available'}
        </div>
      </main>
    );
  }

  return (
    <main className="w-full px-4 pb-4 mb-20">
      <div className="flex flex-col gap-3 mt-4">
        {chapters.map((chapter) => (
          <article 
            key={chapter.id}
            className="flex flex-col bg-white rounded-2xl shadow-sm border border-[#F5F5F5] p-4 hover:shadow-md transition-shadow cursor-pointer"
          >
            <h3 className="text-base font-semibold text-[#2C2C2C] mb-3 leading-tight">
              {chapter.name}
            </h3>
            <div className="flex items-center gap-4 text-xs text-[#9E9E9E]">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#38A6FF]" />
                <span>{chapter.questionCount} Q</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#4CAF50]" />
                <span>{chapter.answerCount} A</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#9C27B0]" />
                <span>{chapter.resourceCount} R</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
};
