import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { computePageCountFromUrls, computePageCountFromText } from '@/utils/pageCountHelpers';
import { normalizedIncludes } from '@/utils/textHelpers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { BarChart3, BookOpen, MessageCircle, Brain, FileText, CheckCircle2, Clock, Play, Loader2, Search, HelpCircle, Sparkles, Building2, User, FileEdit, Check, RefreshCw, X, Image as ImageIcon, Layers, ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Navigate } from 'react-router-dom';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { processResourceOCR } from '@/utils/clientOcrProcessor';
import type { OcrMode } from '@/utils/pdfOcrHelpers';
import { isPdfUrl, isImageUrl, urlsHaveOcrable, textHasOcrableUrl } from '@/utils/mediaTypeUtils';
import { processQuestionOCR } from '@/utils/clientQuestionOcrProcessor';
import { extractAndUpdateResourceMetadata, applySuggestedTitle, type ExtractedMetadata } from '@/utils/metadataExtractor';
import { SEO, createWebPageSchema } from '@/components/SEO';

interface Stats {
  total_questions: number;
  total_answers: number;
  total_resources: number;
  total_memorizations: number;
  verified_questions: number;
  verified_answers: number;
  verified_resources: number;
  verified_memorizations: number;
  resources_with_correction: number;
  devoirs_by_type: { type: string; count: number }[];
}

interface OcrStats {
  total_ocrAble: number;
  completed: number;
  pending: number;
  failed: number;
  not_applicable: number;
}

interface ResourceRow {
  id: number;
  title: string;
  description: string;
  data: string[];
  ocr_status: string | null;
  ocr_text: string | null;
  chapter_id: number | null;
  chapters?: { name: string };
  resource_types?: { type: string };
  school_name?: string | null;
  teacher_name?: string | null;
  suggested_title?: string | null;
}

// Track suggested titles from AI extraction
interface SuggestedTitleEntry {
  resourceId: number;
  suggestedTitle: string;
}

interface QuestionRow {
  id: number;
  data: string;
  ocr_status: string | null;
  ocr_text?: string | null;
  chapter_id: number | null;
  chapters?: { name: string };
}

interface QuestionOcrStats {
  total_ocrAble: number;
  completed: number;
  pending: number;
  failed: number;
  not_applicable: number;
}

export default function Statistics() {
  const { isModerator, isAdmin, loading: roleLoading } = useUserRole();
  const [stats, setStats] = useState<Stats | null>(null);
  const [ocrStats, setOcrStats] = useState<OcrStats | null>(null);
  const [questionOcrStats, setQuestionOcrStats] = useState<QuestionOcrStats | null>(null);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isProcessingQuestionBatch, setIsProcessingQuestionBatch] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [processingQuestionId, setProcessingQuestionId] = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedChapter, setSelectedChapter] = useState<string>('all');
  const [ocrFilter, setOcrFilter] = useState<string>('all');
  const [questionOcrFilter, setQuestionOcrFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [questionSearchQuery, setQuestionSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [questionCurrentPage, setQuestionCurrentPage] = useState(1);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [extractingMetadataId, setExtractingMetadataId] = useState<number | null>(null);
  const [isExtractingBatch, setIsExtractingBatch] = useState(false);
  const [pageBackfillStatus, setPageBackfillStatus] = useState<{ running: boolean; done: number; total: number; label: string } | null>(null);
  const [suggestedTitles, setSuggestedTitles] = useState<SuggestedTitleEntry[]>([]);
  const [applyingTitleId, setApplyingTitleId] = useState<number | null>(null);
  const itemsPerPage = 20;

  // Multi-select state
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<number>>(new Set());
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<number>>(new Set());
  const [forceRetryConfirm, setForceRetryConfirm] = useState<
    | { kind: 'resource' | 'question'; id: number; mode: OcrMode }
    | null
  >(null);

  useEffect(() => {
    if (!roleLoading && (isModerator || isAdmin)) {
      fetchClasses();
      fetchStats(selectedClass, selectedSubject, selectedChapter);
      fetchOcrStats(selectedClass, selectedSubject, selectedChapter);
      fetchQuestionOcrStats(selectedClass, selectedSubject, selectedChapter);
      fetchResources(selectedClass, selectedSubject, selectedChapter);
      fetchQuestions(selectedClass, selectedSubject, selectedChapter);
    }
  }, [selectedClass, selectedSubject, selectedChapter, isModerator, isAdmin, roleLoading]);

  useEffect(() => {
    setCurrentPage(1);
  }, [ocrFilter, searchQuery]);

  useEffect(() => {
    setQuestionCurrentPage(1);
  }, [questionOcrFilter, questionSearchQuery]);

  useEffect(() => {
    if (selectedClass !== 'all') {
      fetchSubjects(selectedClass);
    } else {
      setSubjects([]);
      setSelectedSubject('all');
    }
    setSelectedChapter('all');
  }, [selectedClass]);

  useEffect(() => {
    if (selectedSubject !== 'all') {
      fetchChapters(selectedSubject);
    } else {
      setChapters([]);
      setSelectedChapter('all');
    }
  }, [selectedSubject]);

  const fetchClasses = async () => {
    try {
      const { data } = await supabase
        .from('classes')
        .select('id, name')
        .eq('hidden', false)
        .order('name');
      
      setClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchSubjects = async (classId: string) => {
    try {
      const { data } = await supabase
        .from('subjects')
        .select('id, name')
        .eq('class_id', parseInt(classId))
        .eq('deleted', false)
        .order('name');
      
      setSubjects(data || []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
    }
  };

  const fetchChapters = async (subjectId: string) => {
    try {
      const { data } = await supabase
        .from('chapters')
        .select('id, name')
        .eq('subject_id', parseInt(subjectId))
        .eq('deleted', false)
        .order('name');
      
      setChapters(data || []);
    } catch (error) {
      console.error('Error fetching chapters:', error);
    }
  };

  const fetchStats = async (classId: string, subjectId: string, chapterId: string) => {
    setLoading(true);
    try {
      const classFilter = classId !== 'all' ? parseInt(classId) : null;
      const subjectFilter = subjectId !== 'all' ? parseInt(subjectId) : null;
      const chapterFilter = chapterId !== 'all' ? parseInt(chapterId) : null;

      // Questions
      let questionsQuery = supabase
        .from('questions')
        .select('id, verified, chapter_id, chapters!inner(class_id, subject_id)', { count: 'exact' })
        .eq('deleted', false);
      
      if (classFilter) {
        questionsQuery = questionsQuery.eq('chapters.class_id', classFilter);
      }
      if (subjectFilter) {
        questionsQuery = questionsQuery.eq('chapters.subject_id', subjectFilter);
      }
      if (chapterFilter) {
        questionsQuery = questionsQuery.eq('chapter_id', chapterFilter);
      }

      const { count: totalQuestions } = await questionsQuery;
      const { count: verifiedQuestions } = await questionsQuery.eq('verified', true);

      // Answers
      let answersQuery = supabase
        .from('answers')
        .select('id, verified, questions!inner(chapter_id, chapters!inner(class_id, subject_id))', { count: 'exact' })
        .eq('deleted', false);
      
      if (classFilter) {
        answersQuery = answersQuery.eq('questions.chapters.class_id', classFilter);
      }
      if (subjectFilter) {
        answersQuery = answersQuery.eq('questions.chapters.subject_id', subjectFilter);
      }
      if (chapterFilter) {
        answersQuery = answersQuery.eq('questions.chapter_id', chapterFilter);
      }

      const { count: totalAnswers } = await answersQuery;
      const { count: verifiedAnswers } = await answersQuery.eq('verified', true);

      // Resources
      let resourcesQuery = supabase
        .from('resources')
        .select('id, verified, with_correction, devoir_type_id, chapter_id, subject_id, chapters!inner(class_id, subject_id)', { count: 'exact' })
        .eq('deleted', false);
      
      if (classFilter) {
        resourcesQuery = resourcesQuery.eq('chapters.class_id', classFilter);
      }
      if (subjectFilter) {
        resourcesQuery = resourcesQuery.eq('subject_id', subjectFilter);
      }
      if (chapterFilter) {
        resourcesQuery = resourcesQuery.eq('chapter_id', chapterFilter);
      }

      const { count: totalResources } = await resourcesQuery;
      const { count: verifiedResources } = await resourcesQuery.eq('verified', true);
      const { count: resourcesWithCorrection } = await resourcesQuery.eq('with_correction', true);

      // Resources by devoir type
      let resourcesTypeQuery = supabase
        .from('resources')
        .select('devoir_type_id, devoir_types(devoir_type), chapter_id, subject_id, chapters!inner(class_id, subject_id)')
        .eq('deleted', false)
        .not('devoir_type_id', 'is', null);

      if (classFilter) {
        resourcesTypeQuery = resourcesTypeQuery.eq('chapters.class_id', classFilter);
      }
      if (subjectFilter) {
        resourcesTypeQuery = resourcesTypeQuery.eq('subject_id', subjectFilter);
      }
      if (chapterFilter) {
        resourcesTypeQuery = resourcesTypeQuery.eq('chapter_id', chapterFilter);
      }

      const { data: resourcesData } = await resourcesTypeQuery;

      const devoirCounts: { [key: string]: number } = {};
      resourcesData?.forEach((r: any) => {
        const type = r.devoir_types?.devoir_type || 'Unknown';
        devoirCounts[type] = (devoirCounts[type] || 0) + 1;
      });

      const devoirsByType = Object.entries(devoirCounts).map(([type, count]) => ({
        type,
        count,
      }));

      // Memorizations
      let memorizationsQuery = supabase
        .from('memorizations')
        .select('id, verified, class_id', { count: 'exact' })
        .eq('deleted', false);
      
      if (classFilter) {
        memorizationsQuery = memorizationsQuery.eq('class_id', classFilter);
      }

      const { count: totalMemorizations } = await memorizationsQuery;
      const { count: verifiedMemorizations } = await memorizationsQuery.eq('verified', true);

      setStats({
        total_questions: totalQuestions || 0,
        total_answers: totalAnswers || 0,
        total_resources: totalResources || 0,
        total_memorizations: totalMemorizations || 0,
        verified_questions: verifiedQuestions || 0,
        verified_answers: verifiedAnswers || 0,
        verified_resources: verifiedResources || 0,
        verified_memorizations: verifiedMemorizations || 0,
        resources_with_correction: resourcesWithCorrection || 0,
        devoirs_by_type: devoirsByType,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      toast.error('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const fetchOcrStats = async (classId: string, subjectId: string, chapterId: string) => {
    try {
      const classFilter = classId !== 'all' ? parseInt(classId) : null;
      const subjectFilter = subjectId !== 'all' ? parseInt(subjectId) : null;
      const chapterFilter = chapterId !== 'all' ? parseInt(chapterId) : null;

      let query = supabase
        .from('resources')
        .select('id, ocr_status, data, chapter_id, subject_id, chapters!inner(class_id, subject_id)')
        .eq('deleted', false);

      if (classFilter) query = query.eq('chapters.class_id', classFilter);
      if (subjectFilter) query = query.eq('subject_id', subjectFilter);
      if (chapterFilter) query = query.eq('chapter_id', chapterFilter);

      const { data } = await query;

      const completed = data?.filter(r => r.ocr_status === 'completed').length || 0;
      const pending = data?.filter(r => r.ocr_status === 'pending').length || 0;
      const failed = data?.filter(r => r.ocr_status === 'failed').length || 0;
      const not_applicable = data?.filter(r => r.ocr_status === 'not_applicable' || !r.ocr_status).length || 0;

      setOcrStats({
        total_ocrAble: completed + pending + failed,
        completed,
        pending,
        failed,
        not_applicable,
      });
    } catch (error) {
      console.error('Error fetching OCR stats:', error);
    }
  };

  const fetchQuestionOcrStats = async (classId: string, subjectId: string, chapterId: string) => {
    try {
      const classFilter = classId !== 'all' ? parseInt(classId) : null;
      const subjectFilter = subjectId !== 'all' ? parseInt(subjectId) : null;
      const chapterFilter = chapterId !== 'all' ? parseInt(chapterId) : null;

      let query = supabase
        .from('questions')
        .select('id, ocr_status, data, chapter_id, chapters!inner(class_id, subject_id)')
        .eq('deleted', false);

      if (classFilter) query = query.eq('chapters.class_id', classFilter);
      if (subjectFilter) query = query.eq('chapters.subject_id', subjectFilter);
      if (chapterFilter) query = query.eq('chapter_id', chapterFilter);

      const { data } = await query;

      const completed = data?.filter(q => q.ocr_status === 'completed').length || 0;
      const pending = data?.filter(q => q.ocr_status === 'pending').length || 0;
      const failed = data?.filter(q => q.ocr_status === 'failed').length || 0;
      const not_applicable = data?.filter(q => q.ocr_status === 'not_applicable' || !q.ocr_status).length || 0;

      setQuestionOcrStats({
        total_ocrAble: completed + pending + failed,
        completed,
        pending,
        failed,
        not_applicable,
      });
    } catch (error) {
      console.error('Error fetching question OCR stats:', error);
    }
  };

  const fetchResources = async (classId: string, subjectId: string, chapterId: string) => {
    setResourcesLoading(true);
    try {
      const classFilter = classId !== 'all' ? parseInt(classId) : null;
      const subjectFilter = subjectId !== 'all' ? parseInt(subjectId) : null;
      const chapterFilter = chapterId !== 'all' ? parseInt(chapterId) : null;

      let query = supabase
        .from('resources')
        .select('id, title, description, data, ocr_status, ocr_text, chapter_id, chapters(name), resource_types(type), school_name, teacher_name')
        .eq('deleted', false);

      if (classFilter) query = query.eq('chapters.class_id', classFilter);
      if (subjectFilter) query = query.eq('subject_id', subjectFilter);
      if (chapterFilter) query = query.eq('chapter_id', chapterFilter);

      const { data, error } = await query.order('id', { ascending: false });

      if (error) throw error;
      setResources(data || []);
    } catch (error) {
      console.error('Error fetching resources:', error);
      toast.error('Failed to load resources');
    } finally {
      setResourcesLoading(false);
    }
  };

  const fetchQuestions = async (classId: string, subjectId: string, chapterId: string) => {
    setQuestionsLoading(true);
    try {
      const classFilter = classId !== 'all' ? parseInt(classId) : null;
      const subjectFilter = subjectId !== 'all' ? parseInt(subjectId) : null;
      const chapterFilter = chapterId !== 'all' ? parseInt(chapterId) : null;

      let query = supabase
        .from('questions')
        .select('id, data, ocr_status, ocr_text, chapter_id, chapters(name, subject_id)')
        .eq('deleted', false);

      if (classFilter) query = query.eq('chapters.class_id', classFilter);
      if (subjectFilter) query = query.eq('chapters.subject_id', subjectFilter);
      if (chapterFilter) query = query.eq('chapter_id', chapterFilter);

      const { data, error } = await query.order('id', { ascending: false });

      if (error) throw error;
      setQuestions(data || []);
    } catch (error) {
      console.error('Error fetching questions:', error);
      toast.error('Failed to load questions');
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleProcessAllPending = async (mode: OcrMode = 'mixed') => {
    setIsProcessingBatch(true);
    try {
      const resourcesToProcess = resources.filter(r => {
        const isRetryableStatus =
          r.ocr_status === 'pending' ||
          r.ocr_status === 'failed' ||
          r.ocr_status === 'not_applicable';
        if (!isRetryableStatus) return false;
        // For not_applicable, only retry items that have a PDF/image attached
        if (r.ocr_status === 'not_applicable') return urlsHaveOcrable(r.data);
        return true;
      });
      
      if (resourcesToProcess.length === 0) {
        toast.info('No resources to process');
        return;
      }

      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < resourcesToProcess.length; i++) {
        const resource = resourcesToProcess[i];
        
        try {
          const result = await processResourceOCR(resource.id, (message) => {
            toast.loading(`[${i + 1}/${resourcesToProcess.length}] (${mode}) ${message}`, {
              id: 'batch-progress',
            });
          }, mode);
          
          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
        }
      }
      
      toast.dismiss('batch-progress');
      toast.success(`Completed: ${successCount} | Failed: ${failCount}`);
      
      fetchOcrStats(selectedClass, selectedSubject, selectedChapter);
      fetchResources(selectedClass, selectedSubject, selectedChapter);
      
    } catch (error) {
      console.error('Batch processing error:', error);
      toast.error('Failed to process resources');
    } finally {
      setIsProcessingBatch(false);
    }
  };

  const handleProcessSingle = async (resourceId: number, mode: OcrMode = 'mixed') => {
    setProcessingId(resourceId);
    try {
      const result = await processResourceOCR(resourceId, (message) => {
        toast.loading(`(${mode}) ${message}`, { id: `processing-${resourceId}` });
      }, mode);
      
      toast.dismiss(`processing-${resourceId}`);
      
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      
      fetchOcrStats(selectedClass, selectedSubject, selectedChapter);
      fetchResources(selectedClass, selectedSubject, selectedChapter);
      
    } catch (error) {
      console.error('Processing error:', error);
      toast.error('Failed to process resource');
    } finally {
      setProcessingId(null);
    }
  };

  const handleProcessAllPendingQuestions = async (mode: OcrMode = 'mixed') => {
    setIsProcessingQuestionBatch(true);
    try {
      const questionsToProcess = questions.filter(q => {
        const isRetryableStatus =
          q.ocr_status === 'pending' ||
          q.ocr_status === 'failed' ||
          q.ocr_status === 'not_applicable';
        if (!isRetryableStatus) return false;
        if (q.ocr_status === 'not_applicable') return textHasOcrableUrl(q.data);
        return true;
      });
      
      if (questionsToProcess.length === 0) {
        toast.info('No questions to process');
        return;
      }

      let successCount = 0;
      let failCount = 0;
      
      for (let i = 0; i < questionsToProcess.length; i++) {
        const question = questionsToProcess[i];
        
        try {
          const result = await processQuestionOCR(question.id, (message) => {
            toast.loading(`[${i + 1}/${questionsToProcess.length}] (${mode}) ${message}`, {
              id: 'question-batch-progress',
            });
          }, mode);
          
          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
        }
      }
      
      toast.dismiss('question-batch-progress');
      toast.success(`Completed: ${successCount} | Failed: ${failCount}`);
      
      fetchQuestionOcrStats(selectedClass, selectedSubject, selectedChapter);
      fetchQuestions(selectedClass, selectedSubject, selectedChapter);
      
    } catch (error) {
      console.error('Batch processing error:', error);
      toast.error('Failed to process questions');
    } finally {
      setIsProcessingQuestionBatch(false);
    }
  };

  const handleProcessSingleQuestion = async (questionId: number, mode: OcrMode = 'mixed') => {
    setProcessingQuestionId(questionId);
    try {
      const result = await processQuestionOCR(questionId, (message) => {
        toast.loading(`(${mode}) ${message}`, { id: `processing-question-${questionId}` });
      }, mode);
      
      toast.dismiss(`processing-question-${questionId}`);
      
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      
      fetchQuestionOcrStats(selectedClass, selectedSubject, selectedChapter);
      fetchQuestions(selectedClass, selectedSubject, selectedChapter);
      
    } catch (error) {
      console.error('Processing error:', error);
      toast.error('Failed to process question');
    } finally {
      setProcessingQuestionId(null);
    }
  };

  // Force retry — runs OCR regardless of current status
  const runBulkResourceOcr = async (ids: number[], mode: OcrMode = 'mixed') => {
    if (ids.length === 0) return;
    setIsProcessingBatch(true);
    let successCount = 0;
    let failCount = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        try {
          const result = await processResourceOCR(ids[i], (message) => {
            toast.loading(`[${i + 1}/${ids.length}] (${mode}) ${message}`, { id: 'bulk-resource-ocr' });
          }, mode);
          if (result.success) successCount++; else failCount++;
        } catch {
          failCount++;
        }
      }
      toast.dismiss('bulk-resource-ocr');
      toast.success(`Done: ${successCount} ok, ${failCount} failed`);
      setSelectedResourceIds(new Set());
      fetchOcrStats(selectedClass, selectedSubject, selectedChapter);
      fetchResources(selectedClass, selectedSubject, selectedChapter);
    } finally {
      setIsProcessingBatch(false);
    }
  };

  const runBulkQuestionOcr = async (ids: number[], mode: OcrMode = 'mixed') => {
    if (ids.length === 0) return;
    setIsProcessingQuestionBatch(true);
    let successCount = 0;
    let failCount = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        try {
          const result = await processQuestionOCR(ids[i], (message) => {
            toast.loading(`[${i + 1}/${ids.length}] (${mode}) ${message}`, { id: 'bulk-question-ocr' });
          }, mode);
          if (result.success) successCount++; else failCount++;
        } catch {
          failCount++;
        }
      }
      toast.dismiss('bulk-question-ocr');
      toast.success(`Done: ${successCount} ok, ${failCount} failed`);
      setSelectedQuestionIds(new Set());
      fetchQuestionOcrStats(selectedClass, selectedSubject, selectedChapter);
      fetchQuestions(selectedClass, selectedSubject, selectedChapter);
    } finally {
      setIsProcessingQuestionBatch(false);
    }
  };

  const toggleResourceSelected = (id: number) => {
    setSelectedResourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleQuestionSelected = (id: number) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Metadata extraction handlers
  const handleExtractMetadata = async (resourceId: number) => {
    const resource = resources.find(r => r.id === resourceId);
    if (!resource || !resource.ocr_text || resource.ocr_status !== 'completed') {
      toast.error('Resource must have completed OCR first');
      return;
    }

    setExtractingMetadataId(resourceId);
    try {
      const result = await extractAndUpdateResourceMetadata(
        resourceId,
        resource.ocr_text,
        (message) => {
          toast.loading(message, { id: `extracting-${resourceId}` });
        }
      );
      
      toast.dismiss(`extracting-${resourceId}`);
      
      if (result.success) {
        toast.success(result.message);
        
        // Store suggested title if found
        if (result.metadata.suggested_title) {
          setSuggestedTitles(prev => {
            const filtered = prev.filter(st => st.resourceId !== resourceId);
            return [...filtered, { resourceId, suggestedTitle: result.metadata.suggested_title! }];
          });
        }
        
        // Refresh resources to show updated fields
        fetchResources(selectedClass, selectedSubject, selectedChapter);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('Metadata extraction error:', error);
      toast.error('Failed to extract metadata');
    } finally {
      setExtractingMetadataId(null);
    }
  };

  const handleApplySuggestedTitle = async (resourceId: number) => {
    const suggestedEntry = suggestedTitles.find(st => st.resourceId === resourceId);
    if (!suggestedEntry) {
      toast.error('No suggested title found');
      return;
    }

    setApplyingTitleId(resourceId);
    try {
      const result = await applySuggestedTitle(resourceId, suggestedEntry.suggestedTitle);
      
      if (result.success) {
        toast.success('Title updated successfully');
        // Remove from suggested titles
        setSuggestedTitles(prev => prev.filter(st => st.resourceId !== resourceId));
        // Refresh resources
        fetchResources(selectedClass, selectedSubject, selectedChapter);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('Error applying title:', error);
      toast.error('Failed to apply title');
    } finally {
      setApplyingTitleId(null);
    }
  };

  const handleExtractAllMetadata = async () => {
    const eligibleResources = resources.filter(
      r => r.ocr_status === 'completed' && r.ocr_text
    );
    
    if (eligibleResources.length === 0) {
      toast.info('No resources with completed OCR to process');
      return;
    }

    setIsExtractingBatch(true);
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    const newSuggestedTitles: SuggestedTitleEntry[] = [];
    
    try {
      for (let i = 0; i < eligibleResources.length; i++) {
        const resource = eligibleResources[i];
        
        toast.loading(`[${i + 1}/${eligibleResources.length}] Extracting metadata...`, {
          id: 'batch-metadata-progress',
        });
        
        try {
          const result = await extractAndUpdateResourceMetadata(
            resource.id,
            resource.ocr_text!
          );
          
          if (result.success && (result.metadata.school_name || result.metadata.teacher_name || result.metadata.suggested_title)) {
            successCount++;
            
            // Store suggested title
            if (result.metadata.suggested_title) {
              newSuggestedTitles.push({
                resourceId: resource.id,
                suggestedTitle: result.metadata.suggested_title
              });
            }
          } else if (result.success) {
            skippedCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      toast.dismiss('batch-metadata-progress');
      toast.success(`Completed: ${successCount} extracted, ${skippedCount} no data found, ${failCount} failed`);
      
      // Update suggested titles
      setSuggestedTitles(prev => {
        const existingIds = new Set(newSuggestedTitles.map(st => st.resourceId));
        const filtered = prev.filter(st => !existingIds.has(st.resourceId));
        return [...filtered, ...newSuggestedTitles];
      });
      
      // Refresh resources
      fetchResources(selectedClass, selectedSubject, selectedChapter);
    } catch (error) {
      console.error('Batch metadata extraction error:', error);
      toast.error('Failed to process resources');
    } finally {
      setIsExtractingBatch(false);
    }
  };

  const getOcrStatusBadge = (status: string | null) => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" />Completed</Badge>;
      case 'pending':
        return <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600"><Clock className="w-3 h-3" />Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1">Failed</Badge>;
      default:
        return <Badge variant="outline" className="gap-1">N/A</Badge>;
    }
  };

  const filteredResources = resources.filter(r => {
    const matchesFilter = ocrFilter === 'all' || r.ocr_status === ocrFilter;
    const matchesSearch = normalizedIncludes(r.title, searchQuery);
    return matchesFilter && matchesSearch;
  });

  const totalPages = Math.ceil(filteredResources.length / itemsPerPage);
  const paginatedResources = filteredResources.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const filteredQuestions = questions.filter(q => {
    const matchesFilter = questionOcrFilter === 'all' || q.ocr_status === questionOcrFilter;
    const matchesSearch = normalizedIncludes(q.data, questionSearchQuery);
    return matchesFilter && matchesSearch;
  });

  const questionTotalPages = Math.ceil(filteredQuestions.length / itemsPerPage);
  const paginatedQuestions = filteredQuestions.slice(
    (questionCurrentPage - 1) * itemsPerPage,
    questionCurrentPage * itemsPerPage
  );

  const ocrChartData = ocrStats ? [
    { name: 'Completed', value: ocrStats.completed, color: 'hsl(var(--chart-2))' },
    { name: 'Pending', value: ocrStats.pending, color: 'hsl(var(--chart-3))' },
    { name: 'Failed', value: ocrStats.failed, color: 'hsl(var(--chart-4))' },
    { name: 'Not Applicable', value: ocrStats.not_applicable, color: 'hsl(var(--muted))' },
  ] : [];

  const questionOcrChartData = questionOcrStats ? [
    { name: 'Completed', value: questionOcrStats.completed, color: 'hsl(var(--chart-2))' },
    { name: 'Pending', value: questionOcrStats.pending, color: 'hsl(var(--chart-3))' },
    { name: 'Failed', value: questionOcrStats.failed, color: 'hsl(var(--chart-4))' },
    { name: 'Not Applicable', value: questionOcrStats.not_applicable, color: 'hsl(var(--muted))' },
  ] : [];

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  if (!isModerator && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Statistics"
        description="Platform content statistics and analytics"
        url="/statistics"
        noindex={true}
        jsonLd={createWebPageSchema('Statistics - Qarray', 'Platform statistics', '/statistics')}
      />
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Content Statistics</h1>
            <p className="text-muted-foreground">Overview of platform content</p>
          </div>

          <div className="flex gap-2">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id.toString()}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {subjects.length > 0 && (
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id.toString()}>
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {chapters.length > 0 && (
              <Select value={selectedChapter} onValueChange={setSelectedChapter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by chapter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Chapters</SelectItem>
                  {chapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id.toString()}>
                      {chapter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading statistics...</div>
        ) : !stats ? (
          <div className="text-center py-12 text-muted-foreground">
            No data available
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Questions</CardTitle>
                  <MessageCircle className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total_questions}</div>
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {stats.verified_questions}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Clock className="w-3 h-3" />
                      {stats.total_questions - stats.verified_questions}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Answers</CardTitle>
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total_answers}</div>
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {stats.verified_answers}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Clock className="w-3 h-3" />
                      {stats.total_answers - stats.verified_answers}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Resources</CardTitle>
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total_resources}</div>
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {stats.verified_resources}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Clock className="w-3 h-3" />
                      {stats.total_resources - stats.verified_resources}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Memorizations</CardTitle>
                  <Brain className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total_memorizations}</div>
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {stats.verified_memorizations}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Clock className="w-3 h-3" />
                      {stats.total_memorizations - stats.verified_memorizations}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Resources Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Resources with Corrections</CardTitle>
                  <CardDescription>Number of resources that include corrections</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stats.resources_with_correction}</div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {stats.total_resources > 0
                      ? `${Math.round((stats.resources_with_correction / stats.total_resources) * 100)}% of total resources`
                      : 'No resources yet'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Resources by Type</CardTitle>
                  <CardDescription>Breakdown of devoir types</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats.devoirs_by_type.length > 0 ? (
                      stats.devoirs_by_type.map((item) => (
                        <div key={item.type} className="flex items-center justify-between">
                          <span className="text-sm">{item.type}</span>
                          <Badge variant="secondary">{item.count}</Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No devoir types recorded</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* OCR Processing Stats - Tabbed View */}
            <Card>
              <CardHeader>
                <CardTitle>OCR Processing Status</CardTitle>
                <CardDescription>Text extraction from PDFs and images in resources and questions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Each row and bulk action exposes three OCR pipelines —
                  <span className="mx-1 inline-flex items-center gap-1 font-medium text-foreground">
                    <FileText className="h-3 w-3" /> Text
                  </span>
                  (fastest, digital PDFs),
                  <span className="mx-1 inline-flex items-center gap-1 font-medium text-foreground">
                    <ImageIcon className="h-3 w-3" /> Image
                  </span>
                  (scans / photos),
                  <span className="mx-1 inline-flex items-center gap-1 font-medium text-foreground">
                    <Layers className="h-3 w-3" /> Mixed
                  </span>
                  (most thorough, default).
                </div>
                <Tabs defaultValue="resources" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="resources" className="gap-2">
                      <FileText className="w-4 h-4" />
                      Resources
                    </TabsTrigger>
                    <TabsTrigger value="questions" className="gap-2">
                      <HelpCircle className="w-4 h-4" />
                      Questions
                    </TabsTrigger>
                  </TabsList>

                  {/* Resources OCR Tab */}
                  <TabsContent value="resources" className="space-y-6">
                    {ocrStats && (
                      <>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <h4 className="font-medium">Resources OCR Stats</h4>
                          <div className="flex gap-2">
                            {ocrStats.completed > 0 && (
                              <Button 
                                onClick={handleExtractAllMetadata} 
                                disabled={isExtractingBatch}
                                size="sm"
                                variant="outline"
                              >
                                {isExtractingBatch && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <Sparkles className="mr-1 h-4 w-4" />
                                Extract All Metadata ({ocrStats.completed})
                              </Button>
                            )}
                            {(ocrStats.pending > 0 || ocrStats.failed > 0) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" disabled={isProcessingBatch}>
                                    {isProcessingBatch && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Process All ({ocrStats.pending + ocrStats.failed})
                                    <ChevronDown className="ml-1 h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleProcessAllPending('text')}>
                                    <FileText className="mr-2 h-4 w-4" /> Text only — fastest
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleProcessAllPending('image')}>
                                    <ImageIcon className="mr-2 h-4 w-4" /> Image only — scans
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleProcessAllPending('mixed')}>
                                    <Layers className="mr-2 h-4 w-4" /> Mixed — thorough
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="h-[250px]">
                            <ChartContainer config={{
                              completed: { label: 'Completed', color: 'hsl(var(--chart-2))' },
                              pending: { label: 'Pending', color: 'hsl(var(--chart-3))' },
                              failed: { label: 'Failed', color: 'hsl(var(--chart-4))' },
                              not_applicable: { label: 'Not Applicable', color: 'hsl(var(--muted))' }
                            }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={ocrChartData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                  >
                                    {ocrChartData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                  </Pie>
                                  <ChartTooltip content={<ChartTooltipContent />} />
                                </PieChart>
                              </ResponsiveContainer>
                            </ChartContainer>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm">✅ Completed</span>
                              <Badge variant="secondary">{ocrStats.completed}</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm">⏳ Pending</span>
                              <Badge variant="outline" className="border-yellow-500 text-yellow-600">{ocrStats.pending}</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm">❌ Failed</span>
                              <Badge variant="destructive">{ocrStats.failed}</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm">➖ Not Applicable</span>
                              <Badge variant="outline">{ocrStats.not_applicable}</Badge>
                            </div>
                            <div className="pt-3 border-t">
                              <div className="flex items-center justify-between font-semibold">
                                <span className="text-sm">Total OCR-able</span>
                                <span>{ocrStats.total_ocrAble}</span>
                              </div>
                              {ocrStats.total_ocrAble > 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {Math.round((ocrStats.completed / ocrStats.total_ocrAble) * 100)}% completed
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Resources Table */}
                        <div className="pt-4 border-t">
                          <h4 className="font-medium mb-4">Resources & OCR Status</h4>
                          <div className="flex gap-2 mb-4">
                            <Select value={ocrFilter} onValueChange={setOcrFilter}>
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Filter by status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="failed">Failed</SelectItem>
                                <SelectItem value="not_applicable">Not Applicable</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="relative flex-1">
                              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input 
                                placeholder="Search resources..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-8"
                              />
                            </div>
                          </div>
                          {selectedResourceIds.size > 0 && (
                            <div className="flex items-center justify-between gap-2 mb-3 p-2 rounded-md bg-muted/40 border">
                              <span className="text-sm font-medium">
                                {selectedResourceIds.size} selected
                              </span>
                              <div className="flex items-center gap-2">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" disabled={isProcessingBatch}>
                                      {isProcessingBatch && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                      <RefreshCw className="mr-2 h-4 w-4" />
                                      Retry selected
                                      <ChevronDown className="ml-1 h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => runBulkResourceOcr(Array.from(selectedResourceIds), 'text')}>
                                      <FileText className="mr-2 h-4 w-4" /> Text only
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => runBulkResourceOcr(Array.from(selectedResourceIds), 'image')}>
                                      <ImageIcon className="mr-2 h-4 w-4" /> Image only
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => runBulkResourceOcr(Array.from(selectedResourceIds), 'mixed')}>
                                      <Layers className="mr-2 h-4 w-4" /> Mixed
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSelectedResourceIds(new Set())}
                                >
                                  <X className="mr-2 h-4 w-4" />
                                  Clear
                                </Button>
                              </div>
                            </div>
                          )}
                          {resourcesLoading ? (
                            <div className="text-center py-8 text-muted-foreground">Loading resources...</div>
                          ) : paginatedResources.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">No resources found</div>
                          ) : (
                            <>
                              <div className="rounded-md border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[40px]">
                                        <Checkbox
                                          checked={
                                            paginatedResources.length > 0 &&
                                            paginatedResources.every((r) => selectedResourceIds.has(r.id))
                                          }
                                          onCheckedChange={(checked) => {
                                            setSelectedResourceIds((prev) => {
                                              const next = new Set(prev);
                                              if (checked) {
                                                paginatedResources.forEach((r) => next.add(r.id));
                                              } else {
                                                paginatedResources.forEach((r) => next.delete(r.id));
                                              }
                                              return next;
                                            });
                                          }}
                                        />
                                      </TableHead>
                                      <TableHead className="w-[80px]">ID</TableHead>
                                      <TableHead>Title</TableHead>
                                      <TableHead>Type</TableHead>
                                      <TableHead>Chapter</TableHead>
                                      <TableHead>OCR Status</TableHead>
                                      <TableHead>OCR Text</TableHead>
                                      <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {paginatedResources.map((resource) => {
                                      const isPdfOrImage = urlsHaveOcrable(resource.data);
                                      const canProcess = (
                                        resource.ocr_status === 'pending' ||
                                        resource.ocr_status === 'failed' ||
                                        resource.ocr_status === 'not_applicable'
                                      ) && isPdfOrImage;
                                      const suggestedTitle = suggestedTitles.find(st => st.resourceId === resource.id);
                                      
                                      return (
                                        <TableRow key={resource.id}>
                                          <TableCell>
                                            <Checkbox
                                              checked={selectedResourceIds.has(resource.id)}
                                              onCheckedChange={() => toggleResourceSelected(resource.id)}
                                            />
                                          </TableCell>
                                          <TableCell className="font-medium">{resource.id}</TableCell>
                                          <TableCell>
                                            <div className="space-y-1">
                                              <div className="max-w-[300px] truncate">{resource.title}</div>
                                              {suggestedTitle && (
                                                <div className="flex items-center gap-2">
                                                  <Badge variant="outline" className="text-xs gap-1 text-primary border-primary/30">
                                                    <FileEdit className="w-3 h-3" />
                                                    AI: {suggestedTitle.suggestedTitle.substring(0, 40)}{suggestedTitle.suggestedTitle.length > 40 ? '...' : ''}
                                                  </Badge>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 px-2"
                                                    onClick={() => handleApplySuggestedTitle(resource.id)}
                                                    disabled={applyingTitleId === resource.id}
                                                    title="Apply suggested title"
                                                  >
                                                    {applyingTitleId === resource.id ? (
                                                      <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                      <Check className="h-3 w-3 text-green-600" />
                                                    )}
                                                  </Button>
                                                </div>
                                              )}
                                              {(resource.school_name || resource.teacher_name) && (
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                  {resource.school_name && (
                                                    <span className="flex items-center gap-1">
                                                      <Building2 className="w-3 h-3" />
                                                      {resource.school_name.substring(0, 20)}{resource.school_name.length > 20 ? '...' : ''}
                                                    </span>
                                                  )}
                                                  {resource.teacher_name && (
                                                    <span className="flex items-center gap-1">
                                                      <User className="w-3 h-3" />
                                                      {resource.teacher_name.substring(0, 20)}{resource.teacher_name.length > 20 ? '...' : ''}
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </TableCell>
                                          <TableCell>
                                            <Badge variant="outline">{resource.resource_types?.type || 'Unknown'}</Badge>
                                          </TableCell>
                                          <TableCell>
                                            {resource.chapters?.name || 'N/A'}
                                          </TableCell>
                                          <TableCell>
                                            <div className="space-y-1">
                                              {getOcrStatusBadge(resource.ocr_status)}
                                              <div className="text-[10px] font-mono text-muted-foreground">
                                                {resource.ocr_status ?? 'null'}
                                              </div>
                                            </div>
                                          </TableCell>
                                          <TableCell>
                                            {resource.ocr_text ? (
                                              <Popover>
                                                <PopoverTrigger asChild>
                                                  <button className="text-xs text-left text-muted-foreground hover:text-foreground max-w-[200px] truncate underline-offset-2 hover:underline">
                                                    {resource.ocr_text.substring(0, 60)}
                                                    {resource.ocr_text.length > 60 ? '…' : ''}
                                                  </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[480px] max-h-[400px] overflow-auto">
                                                  <div className="flex justify-end mb-2">
                                                    <Button
                                                      size="sm"
                                                      variant="ghost"
                                                      onClick={() => {
                                                        navigator.clipboard.writeText(resource.ocr_text || '');
                                                        toast.success('Copied OCR text');
                                                      }}
                                                    >
                                                      Copy
                                                    </Button>
                                                  </div>
                                                  <pre className="text-xs whitespace-pre-wrap break-words">
                                                    {resource.ocr_text}
                                                  </pre>
                                                </PopoverContent>
                                              </Popover>
                                            ) : (
                                              <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                              {resource.ocr_status === 'completed' && resource.ocr_text && (
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => handleExtractMetadata(resource.id)}
                                                  disabled={extractingMetadataId === resource.id}
                                                  title="Extract metadata with AI"
                                                >
                                                  {extractingMetadataId === resource.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                  ) : (
                                                    <Sparkles className="h-4 w-4" />
                                                  )}
                                                </Button>
                                              )}
                                              {canProcess && (
                                                <>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleProcessSingle(resource.id, 'text')}
                                                    disabled={processingId === resource.id}
                                                    title="Run OCR — Text only (fast, digital PDFs)"
                                                  >
                                                    {processingId === resource.id ? (
                                                      <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                      <FileText className="h-4 w-4" />
                                                    )}
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleProcessSingle(resource.id, 'image')}
                                                    disabled={processingId === resource.id}
                                                    title="Run OCR — Image only (scans/photos)"
                                                  >
                                                    <ImageIcon className="h-4 w-4" />
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleProcessSingle(resource.id, 'mixed')}
                                                    disabled={processingId === resource.id}
                                                    title="Run OCR — Mixed (most thorough)"
                                                  >
                                                    <Layers className="h-4 w-4" />
                                                  </Button>
                                                </>
                                              )}
                                              <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={processingId === resource.id}
                                                    title="Force retry OCR (any status)"
                                                  >
                                                    <RefreshCw className="h-4 w-4" />
                                                  </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                  {(['text', 'image', 'mixed'] as OcrMode[]).map((m) => (
                                                    <DropdownMenuItem
                                                      key={m}
                                                      onClick={() => {
                                                        if (resource.ocr_status === 'completed') {
                                                          setForceRetryConfirm({ kind: 'resource', id: resource.id, mode: m });
                                                        } else {
                                                          handleProcessSingle(resource.id, m);
                                                        }
                                                      }}
                                                    >
                                                      {m === 'text' && <FileText className="mr-2 h-4 w-4" />}
                                                      {m === 'image' && <ImageIcon className="mr-2 h-4 w-4" />}
                                                      {m === 'mixed' && <Layers className="mr-2 h-4 w-4" />}
                                                      Force retry — {m}
                                                    </DropdownMenuItem>
                                                  ))}
                                                </DropdownMenuContent>
                                              </DropdownMenu>
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                              {totalPages > 1 && (
                                <div className="flex items-center justify-between mt-4">
                                  <div className="text-sm text-muted-foreground">
                                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredResources.length)} of {filteredResources.length} resources
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                      disabled={currentPage === 1}
                                    >
                                      Previous
                                    </Button>
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                      const page = currentPage <= 3 ? i + 1 : 
                                                  currentPage >= totalPages - 2 ? totalPages - 4 + i :
                                                  currentPage - 2 + i;
                                      if (page < 1 || page > totalPages) return null;
                                      return (
                                        <Button
                                          key={page}
                                          variant={page === currentPage ? "default" : "outline"}
                                          size="sm"
                                          onClick={() => setCurrentPage(page)}
                                        >
                                          {page}
                                        </Button>
                                      );
                                    })}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                      disabled={currentPage === totalPages}
                                    >
                                      Next
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </TabsContent>

                  {/* Questions OCR Tab */}
                  <TabsContent value="questions" className="space-y-6">
                    {questionOcrStats && (
                      <>
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">Questions OCR Stats</h4>
                          {(questionOcrStats.pending > 0 || questionOcrStats.failed > 0) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" disabled={isProcessingQuestionBatch}>
                                  {isProcessingQuestionBatch && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  Process All ({questionOcrStats.pending + questionOcrStats.failed})
                                  <ChevronDown className="ml-1 h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleProcessAllPendingQuestions('text')}>
                                  <FileText className="mr-2 h-4 w-4" /> Text only — fastest
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleProcessAllPendingQuestions('image')}>
                                  <ImageIcon className="mr-2 h-4 w-4" /> Image only — scans
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleProcessAllPendingQuestions('mixed')}>
                                  <Layers className="mr-2 h-4 w-4" /> Mixed — thorough
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="h-[250px]">
                            <ChartContainer config={{
                              completed: { label: 'Completed', color: 'hsl(var(--chart-2))' },
                              pending: { label: 'Pending', color: 'hsl(var(--chart-3))' },
                              failed: { label: 'Failed', color: 'hsl(var(--chart-4))' },
                              not_applicable: { label: 'Not Applicable', color: 'hsl(var(--muted))' }
                            }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={questionOcrChartData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                  >
                                    {questionOcrChartData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                  </Pie>
                                  <ChartTooltip content={<ChartTooltipContent />} />
                                </PieChart>
                              </ResponsiveContainer>
                            </ChartContainer>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm">✅ Completed</span>
                              <Badge variant="secondary">{questionOcrStats.completed}</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm">⏳ Pending</span>
                              <Badge variant="outline" className="border-yellow-500 text-yellow-600">{questionOcrStats.pending}</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm">❌ Failed</span>
                              <Badge variant="destructive">{questionOcrStats.failed}</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm">➖ Not Applicable</span>
                              <Badge variant="outline">{questionOcrStats.not_applicable}</Badge>
                            </div>
                            <div className="pt-3 border-t">
                              <div className="flex items-center justify-between font-semibold">
                                <span className="text-sm">Total OCR-able</span>
                                <span>{questionOcrStats.total_ocrAble}</span>
                              </div>
                              {questionOcrStats.total_ocrAble > 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {Math.round((questionOcrStats.completed / questionOcrStats.total_ocrAble) * 100)}% completed
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Questions Table */}
                        <div className="pt-4 border-t">
                          <h4 className="font-medium mb-4">Questions & OCR Status</h4>
                          <div className="flex gap-2 mb-4">
                            <Select value={questionOcrFilter} onValueChange={setQuestionOcrFilter}>
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Filter by status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="failed">Failed</SelectItem>
                                <SelectItem value="not_applicable">Not Applicable</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="relative flex-1">
                              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input 
                                placeholder="Search questions..." 
                                value={questionSearchQuery}
                                onChange={(e) => setQuestionSearchQuery(e.target.value)}
                                className="pl-8"
                              />
                            </div>
                          </div>
                          {selectedQuestionIds.size > 0 && (
                            <div className="flex items-center justify-between gap-2 mb-3 p-2 rounded-md bg-muted/40 border">
                              <span className="text-sm font-medium">
                                {selectedQuestionIds.size} selected
                              </span>
                              <div className="flex items-center gap-2">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" disabled={isProcessingQuestionBatch}>
                                      {isProcessingQuestionBatch && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                      <RefreshCw className="mr-2 h-4 w-4" />
                                      Retry selected
                                      <ChevronDown className="ml-1 h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => runBulkQuestionOcr(Array.from(selectedQuestionIds), 'text')}>
                                      <FileText className="mr-2 h-4 w-4" /> Text only
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => runBulkQuestionOcr(Array.from(selectedQuestionIds), 'image')}>
                                      <ImageIcon className="mr-2 h-4 w-4" /> Image only
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => runBulkQuestionOcr(Array.from(selectedQuestionIds), 'mixed')}>
                                      <Layers className="mr-2 h-4 w-4" /> Mixed
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSelectedQuestionIds(new Set())}
                                >
                                  <X className="mr-2 h-4 w-4" />
                                  Clear
                                </Button>
                              </div>
                            </div>
                          )}
                          {questionsLoading ? (
                            <div className="text-center py-8 text-muted-foreground">Loading questions...</div>
                          ) : paginatedQuestions.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">No questions found</div>
                          ) : (
                            <>
                              <div className="rounded-md border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[40px]">
                                        <Checkbox
                                          checked={
                                            paginatedQuestions.length > 0 &&
                                            paginatedQuestions.every((q) => selectedQuestionIds.has(q.id))
                                          }
                                          onCheckedChange={(checked) => {
                                            setSelectedQuestionIds((prev) => {
                                              const next = new Set(prev);
                                              if (checked) {
                                                paginatedQuestions.forEach((q) => next.add(q.id));
                                              } else {
                                                paginatedQuestions.forEach((q) => next.delete(q.id));
                                              }
                                              return next;
                                            });
                                          }}
                                        />
                                      </TableHead>
                                      <TableHead className="w-[80px]">ID</TableHead>
                                      <TableHead>Question</TableHead>
                                      <TableHead>Chapter</TableHead>
                                      <TableHead>OCR Status</TableHead>
                                      <TableHead>OCR Text</TableHead>
                                      <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {paginatedQuestions.map((question) => {
                                      const hasPdfOrImage = textHasOcrableUrl(question.data);
                                      const canProcess = (
                                        question.ocr_status === 'pending' ||
                                        question.ocr_status === 'failed' ||
                                        question.ocr_status === 'not_applicable'
                                      ) && hasPdfOrImage;
                                      
                                      return (
                                        <TableRow key={question.id}>
                                          <TableCell>
                                            <Checkbox
                                              checked={selectedQuestionIds.has(question.id)}
                                              onCheckedChange={() => toggleQuestionSelected(question.id)}
                                            />
                                          </TableCell>
                                          <TableCell className="font-medium">{question.id}</TableCell>
                                          <TableCell>
                                            <div className="max-w-[400px] truncate">{question.data.substring(0, 100)}</div>
                                          </TableCell>
                                          <TableCell>
                                            {question.chapters?.name || 'N/A'}
                                          </TableCell>
                                          <TableCell>
                                            <div className="space-y-1">
                                              {getOcrStatusBadge(question.ocr_status)}
                                              <div className="text-[10px] font-mono text-muted-foreground">
                                                {question.ocr_status ?? 'null'}
                                              </div>
                                            </div>
                                          </TableCell>
                                          <TableCell>
                                            {question.ocr_text ? (
                                              <Popover>
                                                <PopoverTrigger asChild>
                                                  <button className="text-xs text-left text-muted-foreground hover:text-foreground max-w-[200px] truncate underline-offset-2 hover:underline">
                                                    {question.ocr_text.substring(0, 60)}
                                                    {question.ocr_text.length > 60 ? '…' : ''}
                                                  </button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[480px] max-h-[400px] overflow-auto">
                                                  <div className="flex justify-end mb-2">
                                                    <Button
                                                      size="sm"
                                                      variant="ghost"
                                                      onClick={() => {
                                                        navigator.clipboard.writeText(question.ocr_text || '');
                                                        toast.success('Copied OCR text');
                                                      }}
                                                    >
                                                      Copy
                                                    </Button>
                                                  </div>
                                                  <pre className="text-xs whitespace-pre-wrap break-words">
                                                    {question.ocr_text}
                                                  </pre>
                                                </PopoverContent>
                                              </Popover>
                                            ) : (
                                              <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                              {canProcess && (
                                                <>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleProcessSingleQuestion(question.id, 'text')}
                                                    disabled={processingQuestionId === question.id}
                                                    title="Run OCR — Text only"
                                                  >
                                                    {processingQuestionId === question.id ? (
                                                      <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                      <FileText className="h-4 w-4" />
                                                    )}
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleProcessSingleQuestion(question.id, 'image')}
                                                    disabled={processingQuestionId === question.id}
                                                    title="Run OCR — Image only"
                                                  >
                                                    <ImageIcon className="h-4 w-4" />
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleProcessSingleQuestion(question.id, 'mixed')}
                                                    disabled={processingQuestionId === question.id}
                                                    title="Run OCR — Mixed"
                                                  >
                                                    <Layers className="h-4 w-4" />
                                                  </Button>
                                                </>
                                              )}
                                              <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={processingQuestionId === question.id}
                                                    title="Force retry OCR (any status)"
                                                  >
                                                    <RefreshCw className="h-4 w-4" />
                                                  </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                  {(['text', 'image', 'mixed'] as OcrMode[]).map((m) => (
                                                    <DropdownMenuItem
                                                      key={m}
                                                      onClick={() => {
                                                        if (question.ocr_status === 'completed') {
                                                          setForceRetryConfirm({ kind: 'question', id: question.id, mode: m });
                                                        } else {
                                                          handleProcessSingleQuestion(question.id, m);
                                                        }
                                                      }}
                                                    >
                                                      {m === 'text' && <FileText className="mr-2 h-4 w-4" />}
                                                      {m === 'image' && <ImageIcon className="mr-2 h-4 w-4" />}
                                                      {m === 'mixed' && <Layers className="mr-2 h-4 w-4" />}
                                                      Force retry — {m}
                                                    </DropdownMenuItem>
                                                  ))}
                                                </DropdownMenuContent>
                                              </DropdownMenu>
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                              {questionTotalPages > 1 && (
                                <div className="flex items-center justify-between mt-4">
                                  <div className="text-sm text-muted-foreground">
                                    Showing {((questionCurrentPage - 1) * itemsPerPage) + 1} to {Math.min(questionCurrentPage * itemsPerPage, filteredQuestions.length)} of {filteredQuestions.length} questions
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setQuestionCurrentPage(p => Math.max(1, p - 1))}
                                      disabled={questionCurrentPage === 1}
                                    >
                                      Previous
                                    </Button>
                                    {Array.from({ length: Math.min(5, questionTotalPages) }, (_, i) => {
                                      const page = questionCurrentPage <= 3 ? i + 1 : 
                                                  questionCurrentPage >= questionTotalPages - 2 ? questionTotalPages - 4 + i :
                                                  questionCurrentPage - 2 + i;
                                      if (page < 1 || page > questionTotalPages) return null;
                                      return (
                                        <Button
                                          key={page}
                                          variant={page === questionCurrentPage ? "default" : "outline"}
                                          size="sm"
                                          onClick={() => setQuestionCurrentPage(page)}
                                        >
                                          {page}
                                        </Button>
                                      );
                                    })}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setQuestionCurrentPage(p => Math.min(questionTotalPages, p + 1))}
                                      disabled={questionCurrentPage === questionTotalPages}
                                    >
                                      Next
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <CommonChaptersMatchCard />
          </div>
        )}
      </main>

      <AlertDialog
        open={forceRetryConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setForceRetryConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force retry OCR?</AlertDialogTitle>
            <AlertDialogDescription>
              This {forceRetryConfirm?.kind} already has completed OCR text. Re-running will
              overwrite the existing text. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!forceRetryConfirm) return;
                const { kind, id, mode } = forceRetryConfirm;
                setForceRetryConfirm(null);
                if (kind === 'resource') {
                  handleProcessSingle(id, mode);
                } else {
                  handleProcessSingleQuestion(id, mode);
                }
              }}
            >
              Force retry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CommonChaptersMatchCard() {
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [result, setResult] = useState<{ groups: number; pairs: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      const { count: c } = await supabase
        .from('chapter_common_mappings')
        .select('*', { count: 'exact', head: true });
      setCount(c ?? 0);
      const { data } = await supabase
        .from('chapter_common_mappings')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      setLastRun(data?.[0]?.created_at ?? null);
    };
    load();
  }, []);

  const runMatch = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('match-common-chapters', {
        body: {},
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult({ groups: data.groups, pairs: data.pairs });
      toast.success(
        `Matched ${data.pairs} chapter pairs across ${data.groups} subject groups`,
      );
      // refresh stats
      const { count: c } = await supabase
        .from('chapter_common_mappings')
        .select('*', { count: 'exact', head: true });
      setCount(c ?? 0);
      const { data: lr } = await supabase
        .from('chapter_common_mappings')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      setLastRun(lr?.[0]?.created_at ?? null);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to run AI match');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          Match Common Chapters (Bac classes)
        </CardTitle>
        <CardDescription>
          Use AI to detect equivalent chapters across Bac classes (e.g. "LE DIPOLE RC" ≡ "Dipole RC"). Results appear under each Bac subject's chapter list.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div>
            Stored mappings: <span className="font-semibold text-foreground">{count ?? '—'}</span>
          </div>
          <div>
            Last run:{' '}
            <span className="font-semibold text-foreground">
              {lastRun ? new Date(lastRun).toLocaleString() : 'Never'}
            </span>
          </div>
          {result && (
            <div>
              Last result:{' '}
              <span className="font-semibold text-foreground">
                {result.pairs} pairs / {result.groups} groups
              </span>
            </div>
          )}
        </div>
        <Button onClick={runMatch} disabled={running} className="gap-2">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? 'Matching…' : 'Run AI Match'}
        </Button>
      </CardContent>
    </Card>
  );
}
