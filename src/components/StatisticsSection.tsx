import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AnimatedCounter } from './AnimatedCounter';
import { Card } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { ChevronDown, BookOpen, FileText, MessageCircle, Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SubjectStats {
  id: number;
  name: string;
  resourceCount: number;
  questionCount: number;
  memorizationCount: number;
}

interface ClassStats {
  id: number;
  name: string;
  totalResources: number;
  totalQuestions: number;
  totalMemorizations: number;
  totalAnswers: number;
  subjectCount: number;
  subjects: SubjectStats[];
}

export const StatisticsSection: React.FC = () => {
  const { t } = useTranslation();
  const [classStats, setClassStats] = useState<ClassStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [openClasses, setOpenClasses] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchStatistics = async () => {
      try {
        // Fetch all non-hidden classes
        const { data: classes, error: classError } = await supabase
          .from('classes')
          .select('id, name')
          .eq('hidden', false)
          .order('id');

        if (classError) throw classError;

        const statsPromises = classes?.map(async (cls) => {
          // Get subjects for this class
          const { data: subjects } = await supabase
            .from('subjects')
            .select('id, name')
            .eq('class_id', cls.id)
            .eq('deleted', false);

          // Get resources count
          const { count: resourceCount } = await supabase
            .from('resources')
            .select('*', { count: 'exact', head: true })
            .eq('deleted', false)
            .in('chapter_id', 
              (await supabase.from('chapters').select('id').eq('class_id', cls.id).eq('deleted', false)).data?.map(c => c.id) || []
            );

          // Get questions count
          const { count: questionCount } = await supabase
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .eq('deleted', false)
            .in('chapter_id',
              (await supabase.from('chapters').select('id').eq('class_id', cls.id).eq('deleted', false)).data?.map(c => c.id) || []
            );

          // Get memorizations count
          const { count: memorizationCount } = await supabase
            .from('memorizations')
            .select('*', { count: 'exact', head: true })
            .eq('deleted', false)
            .eq('class_id', cls.id);

          // Get answers count
          const { count: answerCount } = await supabase
            .from('answers')
            .select('*', { count: 'exact', head: true })
            .eq('deleted', false)
            .in('question_id',
              (await supabase.from('questions').select('id').eq('deleted', false).in('chapter_id',
                (await supabase.from('chapters').select('id').eq('class_id', cls.id).eq('deleted', false)).data?.map(c => c.id) || []
              )).data?.map(q => q.id) || []
            );

          // Get per-subject stats
          const subjectStats = await Promise.all(
            subjects?.map(async (subject) => {
              const { count: subjectResourceCount } = await supabase
                .from('resources')
                .select('*', { count: 'exact', head: true })
                .eq('deleted', false)
                .in('chapter_id',
                  (await supabase.from('chapters').select('id').eq('subject_id', subject.id).eq('deleted', false)).data?.map(c => c.id) || []
                );

              const { count: subjectQuestionCount } = await supabase
                .from('questions')
                .select('*', { count: 'exact', head: true })
                .eq('deleted', false)
                .in('chapter_id',
                  (await supabase.from('chapters').select('id').eq('subject_id', subject.id).eq('deleted', false)).data?.map(c => c.id) || []
                );

              const { count: subjectMemorizationCount } = await supabase
                .from('memorizations')
                .select('*', { count: 'exact', head: true })
                .eq('deleted', false)
                .eq('subject_id', subject.id);

              return {
                id: subject.id,
                name: subject.name,
                resourceCount: subjectResourceCount || 0,
                questionCount: subjectQuestionCount || 0,
                memorizationCount: subjectMemorizationCount || 0,
              };
            }) || []
          );

          return {
            id: cls.id,
            name: cls.name,
            totalResources: resourceCount || 0,
            totalQuestions: questionCount || 0,
            totalMemorizations: memorizationCount || 0,
            totalAnswers: answerCount || 0,
            subjectCount: subjects?.length || 0,
            subjects: subjectStats,
          };
        }) || [];

        const stats = await Promise.all(statsPromises);
        setClassStats(stats);
      } catch (error) {
        console.error('Error fetching statistics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatistics();
  }, []);

  const toggleClass = (classId: number) => {
    setOpenClasses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(classId)) {
        newSet.delete(classId);
      } else {
        newSet.add(classId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="w-full max-w-6xl px-6 py-12">
        <Skeleton className="h-10 w-64 mb-8 mx-auto" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (classStats.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-6xl px-6 py-12">
      <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground mb-12">
        {t('statisticsTitle')}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {classStats.map((cls) => (
          <Collapsible
            key={cls.id}
            open={openClasses.has(cls.id)}
            onOpenChange={() => toggleClass(cls.id)}
          >
            <Card className="overflow-hidden hover:border-primary transition-all cursor-pointer bg-background/50 backdrop-blur-sm">
              <CollapsibleTrigger className="w-full text-left p-6">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-xl font-semibold text-foreground">{cls.name}</h3>
                  <ChevronDown
                    className={`w-5 h-5 text-muted-foreground transition-transform ${
                      openClasses.has(cls.id) ? 'rotate-180' : ''
                    }`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded-lg bg-primary/10">
                    <div className="flex items-center justify-center mb-2">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-2xl font-bold text-primary">
                      <AnimatedCounter value={cls.totalResources} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{t('resources')}</div>
                  </div>

                  <div className="text-center p-3 rounded-lg bg-[#F6A18A]/10">
                    <div className="flex items-center justify-center mb-2">
                      <MessageCircle className="w-5 h-5 text-[#F6A18A]" />
                    </div>
                    <div className="text-2xl font-bold text-[#F6A18A]">
                      <AnimatedCounter value={cls.totalQuestions} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{t('questions')}</div>
                  </div>

                  <div className="text-center p-3 rounded-lg bg-[hsl(207,89%,54%)]/10">
                    <div className="flex items-center justify-center mb-2">
                      <Brain className="w-5 h-5 text-[hsl(207,89%,54%)]" />
                    </div>
                    <div className="text-2xl font-bold text-[hsl(207,89%,54%)]">
                      <AnimatedCounter value={cls.totalMemorizations} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{t('memorizations')}</div>
                  </div>

                  <div className="text-center p-3 rounded-lg bg-secondary/50">
                    <div className="flex items-center justify-center mb-2">
                      <BookOpen className="w-5 h-5 text-secondary-foreground" />
                    </div>
                    <div className="text-2xl font-bold text-secondary-foreground">
                      <AnimatedCounter value={cls.subjectCount} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{t('subjects')}</div>
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t border-border p-6 pt-4 space-y-3">
                  <h4 className="font-semibold text-sm text-muted-foreground mb-3">
                    {t('subjectBreakdown')}
                  </h4>
                  {cls.subjects.length > 0 ? (
                    cls.subjects.map((subject) => (
                      <div
                        key={subject.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <span className="font-medium text-sm">{subject.name}</span>
                        <div className="flex gap-3 text-xs">
                          <span className="text-primary">
                            <AnimatedCounter value={subject.resourceCount} suffix=" res" />
                          </span>
                          <span className="text-[#F6A18A]">
                            <AnimatedCounter value={subject.questionCount} suffix=" q" />
                          </span>
                          <span className="text-[hsl(207,89%,54%)]">
                            <AnimatedCounter value={subject.memorizationCount} suffix=" mem" />
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {t('noSubjectsYet')}
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>
    </div>
  );
};
