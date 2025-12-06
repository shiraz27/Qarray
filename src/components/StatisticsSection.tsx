import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AnimatedCounter } from './AnimatedCounter';
import { Skeleton } from './ui/skeleton';
import { 
  BookOpen, 
  FileText, 
  MessageCircle, 
  Brain, 
  Trophy,
  Zap,
  ChevronDown,
  Layers
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

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
  const [selectedClassId, setSelectedClassId] = useState<string>('all');

  useEffect(() => {
    const fetchStatistics = async () => {
      try {
        const { data: classes, error: classError } = await supabase
          .from('classes')
          .select('id, name')
          .eq('hidden', false)
          .order('id');

        if (classError) throw classError;

        const statsPromises = classes?.map(async (cls) => {
          const { data: subjects } = await supabase
            .from('subjects')
            .select('id, name')
            .eq('class_id', cls.id)
            .eq('deleted', false);

          const { count: resourceCount } = await supabase
            .from('resources')
            .select('*', { count: 'exact', head: true })
            .eq('deleted', false)
            .in('chapter_id', 
              (await supabase.from('chapters').select('id').eq('class_id', cls.id).eq('deleted', false)).data?.map(c => c.id) || []
            );

          const { count: questionCount } = await supabase
            .from('questions')
            .select('*', { count: 'exact', head: true })
            .eq('deleted', false)
            .in('chapter_id',
              (await supabase.from('chapters').select('id').eq('class_id', cls.id).eq('deleted', false)).data?.map(c => c.id) || []
            );

          const { count: memorizationCount } = await supabase
            .from('memorizations')
            .select('*', { count: 'exact', head: true })
            .eq('deleted', false)
            .eq('class_id', cls.id);

          const { count: answerCount } = await supabase
            .from('answers')
            .select('*', { count: 'exact', head: true })
            .eq('deleted', false)
            .in('question_id',
              (await supabase.from('questions').select('id').eq('deleted', false).in('chapter_id',
                (await supabase.from('chapters').select('id').eq('class_id', cls.id).eq('deleted', false)).data?.map(c => c.id) || []
              )).data?.map(q => q.id) || []
            );

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

  // Calculate aggregated stats
  const aggregatedStats = useMemo(() => {
    return classStats.reduce(
      (acc, cls) => ({
        totalResources: acc.totalResources + cls.totalResources,
        totalQuestions: acc.totalQuestions + cls.totalQuestions,
        totalMemorizations: acc.totalMemorizations + cls.totalMemorizations,
        totalAnswers: acc.totalAnswers + cls.totalAnswers,
        totalSubjects: acc.totalSubjects + cls.subjectCount,
        totalClasses: acc.totalClasses + 1,
      }),
      { totalResources: 0, totalQuestions: 0, totalMemorizations: 0, totalAnswers: 0, totalSubjects: 0, totalClasses: 0 }
    );
  }, [classStats]);

  // Get current display stats based on selection
  const displayStats = useMemo(() => {
    if (selectedClassId === 'all') {
      return {
        resources: aggregatedStats.totalResources,
        questions: aggregatedStats.totalQuestions,
        memorizations: aggregatedStats.totalMemorizations,
        answers: aggregatedStats.totalAnswers,
        subjects: aggregatedStats.totalSubjects,
        label: t('allClasses'),
      };
    }
    const selectedClass = classStats.find(c => c.id.toString() === selectedClassId);
    if (!selectedClass) return null;
    return {
      resources: selectedClass.totalResources,
      questions: selectedClass.totalQuestions,
      memorizations: selectedClass.totalMemorizations,
      answers: selectedClass.totalAnswers,
      subjects: selectedClass.subjectCount,
      label: selectedClass.name,
    };
  }, [selectedClassId, classStats, aggregatedStats, t]);

  // Get subjects for selected class
  const selectedClassSubjects = useMemo(() => {
    if (selectedClassId === 'all') return [];
    const selectedClass = classStats.find(c => c.id.toString() === selectedClassId);
    return selectedClass?.subjects || [];
  }, [selectedClassId, classStats]);

  if (loading) {
    return (
      <div className="w-full max-w-4xl px-4">
        <Skeleton className="h-8 w-48 mb-6 mx-auto" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (classStats.length === 0 || !displayStats) {
    return null;
  }

  const statItems = [
    {
      icon: FileText,
      value: displayStats.resources,
      label: t('resources'),
      color: 'primary',
      bgClass: 'bg-primary/10',
      textClass: 'text-primary',
    },
    {
      icon: MessageCircle,
      value: displayStats.questions,
      label: t('questions'),
      color: 'coral',
      bgClass: 'bg-[hsl(14,92%,76%)]/15',
      textClass: 'text-[hsl(14,92%,76%)]',
    },
    {
      icon: Brain,
      value: displayStats.memorizations,
      label: t('memorizations'),
      color: 'black',
      bgClass: 'bg-gray-900/10 dark:bg-gray-100/10',
      textClass: 'text-gray-900 dark:text-gray-100',
    },
    {
      icon: BookOpen,
      value: displayStats.subjects,
      label: t('subjects'),
      color: 'gold',
      bgClass: 'bg-[hsl(45,93%,47%)]/15',
      textClass: 'text-[hsl(45,93%,47%)]',
    },
  ];

  return (
    <div className="w-full max-w-4xl px-4">
      {/* Class Selector */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Layers className="w-4 h-4" />
          <span>{t('viewStatsFor')}:</span>
        </div>
        <Select value={selectedClassId} onValueChange={setSelectedClassId}>
          <SelectTrigger className="w-[180px] bg-card border-2 border-border hover:border-primary transition-colors">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-2 border-border z-50">
            <SelectItem value="all" className="cursor-pointer">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[hsl(45,93%,47%)]" />
                <span>{t('allClasses')}</span>
              </div>
            </SelectItem>
            {classStats.map((cls) => (
              <SelectItem key={cls.id} value={cls.id.toString()} className="cursor-pointer">
                {cls.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {statItems.map((stat, index) => {
          const IconComponent = stat.icon;
          return (
            <div
              key={index}
              className="gamified-card p-4 sm:p-5 flex flex-col items-center text-center group relative overflow-hidden"
            >
              {/* Background glow */}
              <div className={`absolute inset-0 ${stat.bgClass} opacity-0 group-hover:opacity-100 transition-opacity`} />
              
              {/* Icon */}
              <div className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${stat.bgClass} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                <IconComponent className={`w-5 h-5 sm:w-6 sm:h-6 ${stat.textClass}`} />
              </div>

              {/* Value */}
              <div className={`relative text-2xl sm:text-3xl font-bold ${stat.textClass} mb-1`}>
                <AnimatedCounter value={stat.value} />
              </div>

              {/* Label */}
              <div className="relative text-xs sm:text-sm text-muted-foreground font-medium">
                {stat.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Subject Breakdown (only when specific class is selected) */}
      {selectedClassId !== 'all' && selectedClassSubjects.length > 0 && (
        <div className="mt-6 p-4 rounded-2xl bg-card/50 border-2 border-border">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-primary" />
            <h4 className="font-semibold text-sm text-foreground">{t('subjectBreakdown')}</h4>
          </div>
          <div className="grid gap-2">
            {selectedClassSubjects.map((subject) => (
              <div
                key={subject.id}
                className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
              >
                <span className="font-medium text-sm text-foreground">{subject.name}</span>
                <div className="flex gap-4 text-xs font-medium">
                  <span className="text-primary flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    <AnimatedCounter value={subject.resourceCount} />
                  </span>
                  <span className="text-[hsl(14,92%,76%)] flex items-center gap-1">
                    <MessageCircle className="w-3 h-3" />
                    <AnimatedCounter value={subject.questionCount} />
                  </span>
                  <span className="text-gray-900 dark:text-gray-100 flex items-center gap-1">
                    <Brain className="w-3 h-3" />
                    <AnimatedCounter value={subject.memorizationCount} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Classes Summary (when viewing all) */}
      {selectedClassId === 'all' && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Trophy className="w-4 h-4 text-[hsl(45,93%,47%)]" />
          <span>
            {t('across')} <span className="font-semibold text-foreground">{aggregatedStats.totalClasses}</span> {t('classes')}
          </span>
        </div>
      )}
    </div>
  );
};
