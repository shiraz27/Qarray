import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { computePageCountFromUrls, computePageCountFromText, withTimeout } from '@/utils/pageCountHelpers';
import { normalizedIncludes } from '@/utils/textHelpers';
import { SourceLinkCell } from '@/components/statistics/SourceLinkCell';
import { computeReadability, READABILITY_LABEL, readabilityBadgeClass, type OcrReadability } from '@/utils/ocrReadability';
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
import { AiGenerationsCard } from '@/components/statistics/AiGenerationsCard';
import { ReportsCard } from '@/components/statistics/ReportsCard';
import { processResourceOCR } from '@/utils/clientOcrProcessor';
import type { OcrMode } from '@/utils/pdfOcrHelpers';
import type { OcrRunOptions } from '@/utils/clientOcrProcessor';
import { OcrScanDialog, type OcrScanContext, type OcrScanSubmit } from '@/components/statistics/OcrScanDialog';
import { isPdfUrl, isImageUrl, urlsHaveOcrable, textHasOcrableUrl } from '@/utils/mediaTypeUtils';
import { processQuestionOCR } from '@/utils/clientQuestionOcrProcessor';
import { extractMediaFromText } from '@/utils/mediaHelpers';
import { extractMetadataFromOCR, applyResourceMetadata, applyQuestionMetadata, type ExtractedMetadata, type MetadataField } from '@/utils/metadataExtractor';
import { MetadataReviewDialog, type MetadataReviewTarget } from '@/components/statistics/MetadataReviewDialog';
import { MetaCell, type CellValue } from '@/components/statistics/MetaCell';
import { OcrStatusEditor, type OcrStatus } from '@/components/statistics/OcrStatusEditor';
import { OcrTextEditor } from '@/components/statistics/OcrTextEditor';
import { OcrReviewButton } from '@/components/statistics/OcrReviewButton';
import { DescriptionAiButton } from '@/components/statistics/DescriptionAiButton';
import { WatermarkStatusEditor, type WatermarkStatus } from '@/components/statistics/WatermarkStatusEditor';
import { processResourceWatermark, processQuestionWatermark } from '@/utils/clientWatermarkProcessor';
import { scanResourceIntegrity, scanQuestionIntegrity } from '@/utils/watermarkIntegrityScanner';
import { Stamp, History } from 'lucide-react';
import { RollbackVersionDialog } from '@/components/statistics/RollbackVersionDialog';
import { restoreRowToVersion } from '@/utils/pdfRollback';
import { PdfSplitCell } from '@/components/statistics/PdfSplitCell';
import { PdfHealthAuditPanel } from '@/components/statistics/PdfHealthAuditPanel';
import { MonitoringPanel } from '@/components/statistics/MonitoringPanel';
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
  ocr_readability?: string | null;
  ocr_text_proposed?: string | null;
  ocr_text_proposed_status?: string | null;
  ocr_text_proposed_readability?: string | null;
  ocr_text_proposed_at?: string | null;
  chapter_id: number | null;
  chapters?: {
    name: string;
    subjects?: { name?: string } | null;
    classes?: { name?: string } | null;
  };
  resource_types?: { type: string };
  school_name?: string | null;
  teacher_name?: string | null;
  suggested_title?: string | null;
  teacher_names?: string[] | null;
  school_names?: string[] | null;
  books?: string[] | null;
  type_ids?: number[] | null;
  page_count?: number | null;
  watermark_status?: string | null;
  pages_watermarked?: number | null;
  watermark_stamp_count?: number | null;
  watermark_overstamped?: boolean | null;
  source_link?: string | null;
  description_proposed?: string | null;
  description_proposed_at?: string | null;
  description_proposed_status?: string | null;
  description_proposed_model?: string | null;
}

interface QuestionRow {
  id: number;
  data: string;
  ocr_status: string | null;
  ocr_text?: string | null;
  ocr_readability?: string | null;
  ocr_text_proposed?: string | null;
  ocr_text_proposed_status?: string | null;
  ocr_text_proposed_readability?: string | null;
  ocr_text_proposed_at?: string | null;
  chapter_id: number | null;
  chapters?: {
    name: string;
    subjects?: { name?: string } | null;
    classes?: { name?: string } | null;
    subject_id?: number | null;
  };
  teacher_names?: string[] | null;
  school_names?: string[] | null;
  books?: string[] | null;
  type_ids?: number[] | null;
  page_count?: number | null;
  watermark_status?: string | null;
  pages_watermarked?: number | null;
  watermark_stamp_count?: number | null;
  watermark_overstamped?: boolean | null;
}

interface QuestionOcrStats {
  total_ocrAble: number;
  completed: number;
  pending: number;
  failed: number;
  not_applicable: number;
}

export default function Statistics() {
  // (watermark integrity fields added in QuestionRow above)
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
  const [watermarkFilter, setWatermarkFilter] = useState<string>('all');
  const [questionWatermarkFilter, setQuestionWatermarkFilter] = useState<string>('all');

  // Derived from watermark integrity scan results.
  // scan_status: unscanned | clean | corrupted
  const [scanStatusFilter, setScanStatusFilter] = useState<string>('all');
  const [questionScanStatusFilter, setQuestionScanStatusFilter] = useState<string>('all');

  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [readabilityFilter, setReadabilityFilter] = useState<string>('all');
  const [questionReadabilityFilter, setQuestionReadabilityFilter] = useState<string>('all');
  const [pagesFilter, setPagesFilter] = useState<string>('all'); // all | none | single | multi
  const [questionPagesFilter, setQuestionPagesFilter] = useState<string>('all');
  const [pagesSort, setPagesSort] = useState<string>('none'); // none | asc | desc
  const [questionPagesSort, setQuestionPagesSort] = useState<string>('none');
  const [teacherFilter, setTeacherFilter] = useState<string>('');
  const [schoolFilter, setSchoolFilter] = useState<string>('');
  const [bookFilter, setBookFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all'); // 'all' | type id as string
  const [descriptionFilter, setDescriptionFilter] = useState<string>('all'); // all | missing | has | has_proposal | applied
  const [questionTeacherFilter, setQuestionTeacherFilter] = useState<string>('');
  const [questionSchoolFilter, setQuestionSchoolFilter] = useState<string>('');
  const [questionBookFilter, setQuestionBookFilter] = useState<string>('');
  const [isProcessingWatermarkBatch, setIsProcessingWatermarkBatch] = useState(false);
  const [isProcessingWatermarkQuestionBatch, setIsProcessingWatermarkQuestionBatch] = useState(false);
  const [processingWatermarkId, setProcessingWatermarkId] = useState<number | null>(null);
  const [processingWatermarkQuestionId, setProcessingWatermarkQuestionId] = useState<number | null>(null);
  const [isScanningWmBatch, setIsScanningWmBatch] = useState(false);
  const [isScanningWmQuestionBatch, setIsScanningWmQuestionBatch] = useState(false);
  const [scanningWmId, setScanningWmId] = useState<number | null>(null);
  const [scanningWmQuestionId, setScanningWmQuestionId] = useState<number | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<
    { table: 'resources' | 'questions'; id: number } | null
  >(null);
  const [isRollbackBatch, setIsRollbackBatch] = useState(false);
  const [isRollbackQuestionBatch, setIsRollbackQuestionBatch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [questionSearchQuery, setQuestionSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [questionCurrentPage, setQuestionCurrentPage] = useState(1);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [resourceTypes, setResourceTypes] = useState<{ id: number; type: string }[]>([]);
  const [extractingMetadataId, setExtractingMetadataId] = useState<number | null>(null);
  const [isExtractingBatch, setIsExtractingBatch] = useState(false);
  const [pageBackfillStatus, setPageBackfillStatus] = useState<{
    running: boolean;
    done: number;
    total: number;
    label: string;
    success: number;
    partial: number;
    failed: number;
  } | null>(null);
  const [metadataReview, setMetadataReview] = useState<MetadataReviewTarget | null>(null);
  const [applyingReview, setApplyingReview] = useState(false);
  const itemsPerPage = 20;

  /**
   * Backfill page_count for rows where it's NULL.
   * - Concurrency: 4 in flight at once
   * - Per-row timeout: 45s (so a single slow Archive.org PDF can't stall the run)
   * - Partial PDF failures still write the partial count (better than NULL)
   * - Skips rows that failed in this run; persists `failedIds` so subsequent runs
   *   can opt to skip them too via the localStorage checkpoint
   */
  const PAGE_BACKFILL_KEY = 'pageBackfill:v1';
  const PAGE_BACKFILL_CONCURRENCY = 4;
  const PAGE_BACKFILL_ROW_TIMEOUT_MS = 45_000;

  const loadBackfillCheckpoint = (): { failedResources: number[]; failedQuestions: number[] } => {
    try {
      const raw = localStorage.getItem(PAGE_BACKFILL_KEY);
      if (!raw) return { failedResources: [], failedQuestions: [] };
      const p = JSON.parse(raw);
      return {
        failedResources: Array.isArray(p.failedResources) ? p.failedResources : [],
        failedQuestions: Array.isArray(p.failedQuestions) ? p.failedQuestions : [],
      };
    } catch {
      return { failedResources: [], failedQuestions: [] };
    }
  };

  const saveBackfillCheckpoint = (failedResources: number[], failedQuestions: number[]) => {
    try {
      localStorage.setItem(
        PAGE_BACKFILL_KEY,
        JSON.stringify({ failedResources, failedQuestions }),
      );
    } catch {}
  };

  const resetPageBackfillCheckpoint = () => {
    try { localStorage.removeItem(PAGE_BACKFILL_KEY); } catch {}
    setPageBackfillStatus(null);
    toast.success('Backfill checkpoint cleared');
  };

  const runPageCountBackfill = async (opts?: { skipPreviouslyFailed?: boolean }) => {
    const skipPrev = opts?.skipPreviouslyFailed ?? true;
    const checkpoint = loadBackfillCheckpoint();
    const skipResIds = new Set<number>(skipPrev ? checkpoint.failedResources : []);
    const skipQIds = new Set<number>(skipPrev ? checkpoint.failedQuestions : []);

    setPageBackfillStatus({
      running: true, done: 0, total: 0, label: 'Loading…',
      success: 0, partial: 0, failed: 0,
    });

    try {
      const { data: resRowsRaw } = await (supabase as any)
        .from('resources')
        .select('id, data')
        .is('page_count', null)
        .eq('deleted', false);
      const { data: qRowsRaw } = await (supabase as any)
        .from('questions')
        .select('id, data')
        .is('page_count', null)
        .eq('deleted', false);

      const resRows = (resRowsRaw || []).filter((r: any) => !skipResIds.has(r.id));
      const qRows = (qRowsRaw || []).filter((q: any) => !skipQIds.has(q.id));
      const total = resRows.length + qRows.length;

      let done = 0, success = 0, partial = 0, failed = 0;
      const newFailedRes = new Set<number>(checkpoint.failedResources);
      const newFailedQ = new Set<number>(checkpoint.failedQuestions);

      const update = (label: string) => setPageBackfillStatus({
        running: true, done, total, label, success, partial, failed,
      });
      update('Resources');

      const processResource = async (r: { id: number; data: string[] | null }) => {
        try {
          const result = await withTimeout(
            computePageCountFromUrls(r.data || []),
            PAGE_BACKFILL_ROW_TIMEOUT_MS,
          );
          if (result.complete) {
            await (supabase as any).from('resources').update({ page_count: result.count }).eq('id', r.id);
            success += 1;
            newFailedRes.delete(r.id);
          } else if (result.count > 0) {
            // Write partial — better than NULL — and remember we tried.
            await (supabase as any).from('resources').update({ page_count: result.count }).eq('id', r.id);
            partial += 1;
            newFailedRes.add(r.id);
          } else {
            failed += 1;
            newFailedRes.add(r.id);
          }
        } catch (err) {
          console.warn('[backfill] resource', r.id, err);
          failed += 1;
          newFailedRes.add(r.id);
        } finally {
          done += 1;
          update('Resources');
        }
      };

      const processQuestion = async (q: { id: number; data: string }) => {
        try {
          const result = await withTimeout(
            computePageCountFromText(q.data || ''),
            PAGE_BACKFILL_ROW_TIMEOUT_MS,
          );
          if (result.complete) {
            await (supabase as any).from('questions').update({ page_count: result.count }).eq('id', q.id);
            success += 1;
            newFailedQ.delete(q.id);
          } else if (result.count > 0) {
            await (supabase as any).from('questions').update({ page_count: result.count }).eq('id', q.id);
            partial += 1;
            newFailedQ.add(q.id);
          } else {
            failed += 1;
            newFailedQ.add(q.id);
          }
        } catch (err) {
          console.warn('[backfill] question', q.id, err);
          failed += 1;
          newFailedQ.add(q.id);
        } finally {
          done += 1;
          update('Questions');
        }
      };

      // Pool runner: launches up to N tasks at once.
      const runPool = async <T,>(items: T[], worker: (item: T) => Promise<void>) => {
        let i = 0;
        const launch = async (): Promise<void> => {
          while (i < items.length) {
            const idx = i++;
            await worker(items[idx]);
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(PAGE_BACKFILL_CONCURRENCY, items.length) }, launch),
        );
      };

      await runPool(resRows, processResource);
      await runPool(qRows, processQuestion);

      saveBackfillCheckpoint(Array.from(newFailedRes), Array.from(newFailedQ));
      setPageBackfillStatus({
        running: false, done, total, label: 'Done',
        success, partial, failed,
      });
    } catch (err) {
      console.error('[backfill] fatal', err);
      setPageBackfillStatus((s) => s ? { ...s, running: false, label: 'Error' } : null);
    }
  };

  // Multi-select state
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<number>>(new Set());
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<number>>(new Set());
  const [forceRetryConfirm, setForceRetryConfirm] = useState<
    | { kind: 'resource' | 'question'; id: number; mode: OcrMode }
    | null
  >(null);
  const [ocrScanTarget, setOcrScanTarget] = useState<
    | { kind: 'resource' | 'question'; id: number; context: OcrScanContext }
    | null
  >(null);
  const [ocrScanRunning, setOcrScanRunning] = useState(false);

  useEffect(() => {
    if (!roleLoading && (isModerator || isAdmin)) {
      fetchClasses();
      fetchResourceTypes();
      fetchStats(selectedClass, selectedSubject, selectedChapter);
      fetchOcrStats(selectedClass, selectedSubject, selectedChapter);
      fetchQuestionOcrStats(selectedClass, selectedSubject, selectedChapter);
      fetchResources(selectedClass, selectedSubject, selectedChapter);
      fetchQuestions(selectedClass, selectedSubject, selectedChapter);
    }
  }, [selectedClass, selectedSubject, selectedChapter, isModerator, isAdmin, roleLoading]);

  useEffect(() => {
    setCurrentPage(1);
  }, [ocrFilter, watermarkFilter, sourceFilter, readabilityFilter, searchQuery,
      pagesFilter, pagesSort, teacherFilter, schoolFilter, bookFilter, typeFilter, descriptionFilter,
      scanStatusFilter]);

  // Lazy backfill: compute & persist ocr_readability for rows that are missing it.
  useEffect(() => {
    const missing = resources.filter((r) => !r.ocr_readability);
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      // Group by computed readability so we can do one UPDATE per bucket.
      const buckets: Record<string, number[]> = {};
      const computed = new Map<number, string>();
      for (const r of missing) {
        const src = (r.ocr_text && r.ocr_text.trim())
          ? r.ocr_text
          : [r.title ?? '', r.description ?? ''].filter(Boolean).join('\n');
        if (!src.trim()) continue;
        const tier = computeReadability(src);
        computed.set(r.id, tier);
        (buckets[tier] ||= []).push(r.id);
      }
      if (computed.size === 0 || cancelled) return;
      for (const [tier, ids] of Object.entries(buckets)) {
        if (cancelled) return;
        await supabase.from('resources').update({ ocr_readability: tier }).in('id', ids);
      }
      if (cancelled) return;
      setResources((prev) =>
        prev.map((r) => (computed.has(r.id) ? { ...r, ocr_readability: computed.get(r.id)! } : r)),
      );
    })();
    return () => { cancelled = true; };
     
  }, [resources]);

  useEffect(() => {
    const missing = questions.filter((q) => !q.ocr_readability);
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const buckets: Record<string, number[]> = {};
      const computed = new Map<number, string>();
      for (const q of missing) {
        const src = (q.ocr_text && q.ocr_text.trim()) ? q.ocr_text : (q.data ?? '');
        if (!src.trim()) continue;
        const tier = computeReadability(src);
        computed.set(q.id, tier);
        (buckets[tier] ||= []).push(q.id);
      }
      if (computed.size === 0 || cancelled) return;
      for (const [tier, ids] of Object.entries(buckets)) {
        if (cancelled) return;
        await supabase.from('questions').update({ ocr_readability: tier }).in('id', ids);
      }
      if (cancelled) return;
      setQuestions((prev) =>
        prev.map((q) => (computed.has(q.id) ? { ...q, ocr_readability: computed.get(q.id)! } : q)),
      );
    })();
    return () => { cancelled = true; };
     
  }, [questions]);

  useEffect(() => {
    setQuestionCurrentPage(1);
  }, [questionOcrFilter, questionWatermarkFilter, questionReadabilityFilter, questionSearchQuery,
      questionPagesFilter, questionPagesSort, questionTeacherFilter, questionSchoolFilter, questionBookFilter,
      questionScanStatusFilter]);

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

  const fetchResourceTypes = async () => {
    try {
      const { data } = await supabase.from('resource_types').select('id, type').order('id');
      setResourceTypes(data || []);
    } catch (error) {
      console.error('Error fetching resource types:', error);
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
        .select('id, title, description, data, ocr_status, ocr_text, ocr_readability, ocr_text_proposed, ocr_text_proposed_status, ocr_text_proposed_readability, ocr_text_proposed_at, chapter_id, chapters(name, subjects(name), classes(name)), resource_types(type), school_name, teacher_name, teacher_names, school_names, books, type_ids, page_count, watermark_status, pages_watermarked, watermark_stamp_count, watermark_overstamped, source_link, description_proposed, description_proposed_at, description_proposed_status, description_proposed_model')
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
        .select('id, data, ocr_status, ocr_text, ocr_readability, ocr_text_proposed, ocr_text_proposed_status, ocr_text_proposed_readability, ocr_text_proposed_at, chapter_id, chapters(name, subject_id, subjects(name), classes(name)), teacher_names, school_names, books, type_ids, page_count, watermark_status, pages_watermarked, watermark_stamp_count, watermark_overstamped')
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

  const handleProcessSingle = async (
    resourceId: number,
    mode: OcrMode = 'mixed',
    runOpts: OcrRunOptions = {},
  ) => {
    setProcessingId(resourceId);
    try {
      const result = await processResourceOCR(resourceId, (message) => {
        toast.loading(`(${mode}) ${message}`, { id: `processing-${resourceId}` });
      }, mode, runOpts);
      
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

  const handleProcessSingleQuestion = async (
    questionId: number,
    mode: OcrMode = 'mixed',
    runOpts: OcrRunOptions = {},
  ) => {
    setProcessingQuestionId(questionId);
    try {
      const result = await processQuestionOCR(questionId, (message) => {
        toast.loading(`(${mode}) ${message}`, { id: `processing-question-${questionId}` });
      }, mode, runOpts);
      
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

  // ---------- Watermark handlers ----------
  const handleWatermarkSingleResource = async (id: number) => {
    setProcessingWatermarkId(id);
    try {
      const result = await processResourceWatermark(id, (p) => {
        toast.loading(p.message, { id: `wm-r-${id}` });
      });
      toast.dismiss(`wm-r-${id}`);
      result.success ? toast.success(result.message) : toast.error(result.message);
      fetchResources(selectedClass, selectedSubject, selectedChapter);
    } finally {
      setProcessingWatermarkId(null);
    }
  };

  const handleWatermarkSingleQuestion = async (id: number) => {
    setProcessingWatermarkQuestionId(id);
    try {
      const result = await processQuestionWatermark(id, (p) => {
        toast.loading(p.message, { id: `wm-q-${id}` });
      });
      toast.dismiss(`wm-q-${id}`);
      result.success ? toast.success(result.message) : toast.error(result.message);
      fetchQuestions(selectedClass, selectedSubject, selectedChapter);
    } finally {
      setProcessingWatermarkQuestionId(null);
    }
  };

  const handleWatermarkAllResources = async () => {
    const targets = resources.filter((r) => {
      const s = r.watermark_status ?? 'pending';
      if (!['pending', 'failed', 'partial'].includes(s)) return false;
      return urlsHaveOcrable(r.data);
    });
    if (targets.length === 0) {
      toast.info('No resources need watermarking');
      return;
    }
    setIsProcessingWatermarkBatch(true);
    let ok = 0, ko = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        try {
          const res = await processResourceWatermark(t.id, (p) => {
            toast.loading(`[${i + 1}/${targets.length}] ${p.message}`, { id: 'wm-r-batch' });
          });
          res.success ? ok++ : ko++;
        } catch { ko++; }
      }
      toast.dismiss('wm-r-batch');
      toast.success(`Watermark batch: ${ok} ok, ${ko} failed`);
      fetchResources(selectedClass, selectedSubject, selectedChapter);
    } finally {
      setIsProcessingWatermarkBatch(false);
    }
  };

  const handleWatermarkAllQuestions = async () => {
    const targets = questions.filter((q) => {
      const s = q.watermark_status ?? 'pending';
      if (!['pending', 'failed', 'partial'].includes(s)) return false;
      return textHasOcrableUrl(q.data);
    });
    if (targets.length === 0) {
      toast.info('No questions need watermarking');
      return;
    }
    setIsProcessingWatermarkQuestionBatch(true);
    let ok = 0, ko = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        try {
          const res = await processQuestionWatermark(t.id, (p) => {
            toast.loading(`[${i + 1}/${targets.length}] ${p.message}`, { id: 'wm-q-batch' });
          });
          res.success ? ok++ : ko++;
        } catch { ko++; }
      }
      toast.dismiss('wm-q-batch');
      toast.success(`Watermark batch: ${ok} ok, ${ko} failed`);
      fetchQuestions(selectedClass, selectedSubject, selectedChapter);
    } finally {
      setIsProcessingWatermarkQuestionBatch(false);
    }
  };

  // ---------- Bulk rollback (over-stamped) ----------
  const handleRollbackAllOverstampedResources = async () => {
    const targets = resources.filter((r) => !!r.watermark_overstamped);
    if (targets.length === 0) {
      toast.info('No over-stamped resources to rollback');
      return;
    }
    if (!confirm(`Rollback ${targets.length} over-stamped resource(s) to their earliest version?`)) return;
    setIsRollbackBatch(true);
    let ok = 0, ko = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        toast.loading(`[${i + 1}/${targets.length}] Rolling back #${t.id}…`, { id: 'rb-r-batch' });
        try {
          const res = await restoreRowToVersion('resources', t.id, 'earliest');
          res.restored > 0 ? ok++ : ko++;
        } catch { ko++; }
      }
      toast.dismiss('rb-r-batch');
      toast.success(`Rollback batch: ${ok} ok, ${ko} failed`);
      fetchResources(selectedClass, selectedSubject, selectedChapter);
    } finally {
      setIsRollbackBatch(false);
    }
  };

  const handleRollbackAllOverstampedQuestions = async () => {
    const targets = questions.filter((q) => !!q.watermark_overstamped);
    if (targets.length === 0) {
      toast.info('No over-stamped questions to rollback');
      return;
    }
    if (!confirm(`Rollback ${targets.length} over-stamped question(s) to their earliest version?`)) return;
    setIsRollbackQuestionBatch(true);
    let ok = 0, ko = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        toast.loading(`[${i + 1}/${targets.length}] Rolling back #${t.id}…`, { id: 'rb-q-batch' });
        try {
          const res = await restoreRowToVersion('questions', t.id, 'earliest');
          res.restored > 0 ? ok++ : ko++;
        } catch { ko++; }
      }
      toast.dismiss('rb-q-batch');
      toast.success(`Rollback batch: ${ok} ok, ${ko} failed`);
      fetchQuestions(selectedClass, selectedSubject, selectedChapter);
    } finally {
      setIsRollbackQuestionBatch(false);
    }
  };

  // ---------- Watermark integrity scan ----------
  const handleScanResource = async (id: number) => {
    setScanningWmId(id);
    try {
      const res = await scanResourceIntegrity(id, (p) => {
        toast.loading(p.message, { id: `wm-scan-r-${id}` });
      });
      toast.dismiss(`wm-scan-r-${id}`);
      (res.success ? toast.success : toast.error)(res.message);
      setResources((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, watermark_stamp_count: res.maxStampCount, watermark_overstamped: res.overStamped }
            : r,
        ),
      );
    } finally {
      setScanningWmId(null);
    }
  };

  const handleScanQuestion = async (id: number) => {
    setScanningWmQuestionId(id);
    try {
      const res = await scanQuestionIntegrity(id, (p) => {
        toast.loading(p.message, { id: `wm-scan-q-${id}` });
      });
      toast.dismiss(`wm-scan-q-${id}`);
      (res.success ? toast.success : toast.error)(res.message);
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === id
            ? { ...q, watermark_stamp_count: res.maxStampCount, watermark_overstamped: res.overStamped }
            : q,
        ),
      );
    } finally {
      setScanningWmQuestionId(null);
    }
  };

  const handleScanAllResources = async () => {
    const targets = resources.filter((r) => {
      const s = r.watermark_status ?? 'pending';
      return ['completed', 'partial'].includes(s);
    });
    if (targets.length === 0) {
      toast.info('No watermarked resources to scan');
      return;
    }
    setIsScanningWmBatch(true);
    let bad = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        try {
          const res = await scanResourceIntegrity(t.id, (p) => {
            toast.loading(`[${i + 1}/${targets.length}] ${p.message}`, { id: 'wm-scan-r-batch' });
          });
          if (res.overStamped) bad++;
          setResources((prev) =>
            prev.map((r) =>
              r.id === t.id
                ? { ...r, watermark_stamp_count: res.maxStampCount, watermark_overstamped: res.overStamped }
                : r,
            ),
          );
        } catch { /* ignore */ }
      }
      toast.dismiss('wm-scan-r-batch');
      toast.success(`Scan complete: ${bad} over-stamped of ${targets.length}`);
    } finally {
      setIsScanningWmBatch(false);
    }
  };

  const handleScanAllQuestions = async () => {
    const targets = questions.filter((q) => {
      const s = q.watermark_status ?? 'pending';
      return ['completed', 'partial'].includes(s);
    });
    if (targets.length === 0) {
      toast.info('No watermarked questions to scan');
      return;
    }
    setIsScanningWmQuestionBatch(true);
    let bad = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        try {
          const res = await scanQuestionIntegrity(t.id, (p) => {
            toast.loading(`[${i + 1}/${targets.length}] ${p.message}`, { id: 'wm-scan-q-batch' });
          });
          if (res.overStamped) bad++;
          setQuestions((prev) =>
            prev.map((q) =>
              q.id === t.id
                ? { ...q, watermark_stamp_count: res.maxStampCount, watermark_overstamped: res.overStamped }
                : q,
            ),
          );
        } catch { /* ignore */ }
      }
      toast.dismiss('wm-scan-q-batch');
      toast.success(`Scan complete: ${bad} over-stamped of ${targets.length}`);
    } finally {
      setIsScanningWmQuestionBatch(false);
    }
  };

  // Metadata extraction handlers
  // Per-row AI metadata extraction: fetch proposal, then open review dialog.
  // No automatic writes — user must approve via MetadataReviewDialog.
  const openMetadataReview = async (kind: 'resource' | 'question', id: number) => {
    const row: any = kind === 'resource'
      ? resources.find((r) => r.id === id)
      : questions.find((q) => q.id === id);
    if (!row || !row.ocr_text || row.ocr_status !== 'completed') {
      toast.error('Item must have completed OCR first');
      return;
    }
    setExtractingMetadataId(id);
    try {
      const result = await extractMetadataFromOCR(row.ocr_text, kind === 'resource' ? { resourceId: id } : { questionId: id });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      setMetadataReview({
        kind,
        id,
        proposed: result.metadata,
        current: kind === 'resource'
          ? {
              title: row.title ?? null,
              description: row.description ?? null,
              teacher_names: row.teacher_names ?? [],
              school_names: row.school_names ?? [],
              books: row.books ?? [],
              type_id: row.type_id ?? null,
              devoir_type_id: row.devoir_type_id ?? null,
            }
          : {
              teacher_names: row.teacher_names ?? [],
              school_names: row.school_names ?? [],
              books: row.books ?? [],
              type_id: row.type_id ?? null,
            },
      });
    } catch (err) {
      console.error('extract metadata error', err);
      toast.error('Failed to extract metadata');
    } finally {
      setExtractingMetadataId(null);
    }
  };

  const applyMetadataReview = async (fields: MetadataField[]) => {
    if (!metadataReview) return;
    setApplyingReview(true);
    try {
      const res = metadataReview.kind === 'resource'
        ? await applyResourceMetadata(metadataReview.id, metadataReview.proposed, fields)
        : await applyQuestionMetadata(metadataReview.id, metadataReview.proposed, fields);
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      toast.success(`Applied ${Object.keys(res.updates).length} field(s)`);
      if (metadataReview.kind === 'resource') {
        fetchResources(selectedClass, selectedSubject, selectedChapter);
      } else {
        fetchQuestions(selectedClass, selectedSubject, selectedChapter);
      }
      setMetadataReview(null);
    } catch (err) {
      console.error('apply metadata error', err);
      toast.error('Failed to apply metadata');
    } finally {
      setApplyingReview(false);
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

  const pageMatcher = (count: number | null | undefined, mode: string) => {
    if (mode === 'all') return true;
    if (mode === 'none') return count == null;
    if (mode === 'single') return count === 1;
    if (mode === 'multi') return typeof count === 'number' && count > 1;
    return true;
  };
  const textMatchesAny = (needle: string, fields: (string | null | undefined)[]) => {
    const n = needle.trim();
    if (!n) return true;
    return fields.some((f) => normalizedIncludes(f ?? '', n));
  };
  const filteredResources = resources.filter(r => {
    const matchesFilter = ocrFilter === 'all' || r.ocr_status === ocrFilter;
    const matchesWm =
      watermarkFilter === 'all'
        ? true
        : watermarkFilter === 'over_stamped'
          ? !!r.watermark_overstamped
          : watermarkFilter === 'not_stamped'
            ? !r.watermark_status
            : r.watermark_status === watermarkFilter;
    // scanStatus derived from watermark integrity scan.
    const scanStatus =
      r.watermark_stamp_count === null || r.watermark_stamp_count === undefined
        ? 'unscanned'
        : r.watermark_overstamped
          ? 'corrupted'
          : 'clean';
    const matchesScanStatus = scanStatusFilter === 'all' || scanStatus === scanStatusFilter;

    const src = r.source_link ?? '';
    const srcIsUrl = /^https?:\/\//i.test(src);
    const matchesSource =
      sourceFilter === 'all' ? true :
      sourceFilter === 'missing' ? !src :
      sourceFilter === 'has_link' ? srcIsUrl :
      sourceFilter === 'has_book_name' ? (!!src && !srcIsUrl) :
      true;
    const matchesReadability =
      readabilityFilter === 'all' ? true :
      readabilityFilter === 'missing' ? !r.ocr_readability :
      r.ocr_readability === readabilityFilter;
    const matchesPages = pageMatcher(r.page_count ?? null, pagesFilter);
    const matchesTeacher = textMatchesAny(teacherFilter, [r.teacher_name, ...(r.teacher_names ?? [])]);
    const matchesSchool = textMatchesAny(schoolFilter, [r.school_name, ...(r.school_names ?? [])]);
    const matchesBook = textMatchesAny(bookFilter, [...(r.books ?? [])]);
    const matchesType =
      typeFilter === 'all' ? true : (r.type_ids ?? []).map(String).includes(typeFilter);
    const desc = (r.description ?? '').trim();
    const hasProposal = !!(r.description_proposed && r.description_proposed.trim());
    const matchesDescription =
      descriptionFilter === 'all' ? true :
      descriptionFilter === 'missing' ? !desc :
      descriptionFilter === 'has' ? !!desc :
      descriptionFilter === 'has_proposal' ? hasProposal :
      descriptionFilter === 'applied' ? (r.description_proposed_status === 'applied') :
      true;
    const matchesSearch = textMatchesAny(searchQuery ?? '', [
      r.title,
      r.description,
      r.description_proposed,
      r.chapters?.name,
      r.school_name,
      r.teacher_name,
      r.source_link,
      r.ocr_readability,
      r.ocr_status,
      r.watermark_status,
      r.ocr_text,
      r.ocr_text_proposed,
      ...(r.teacher_names ?? []),
      ...(r.school_names ?? []),
      ...(r.books ?? []),
      String(r.id),
    ]);
    return matchesFilter && matchesWm && matchesSource && matchesReadability
      && matchesPages && matchesTeacher && matchesSchool && matchesBook
      && matchesType && matchesDescription && matchesSearch
      && matchesScanStatus;
  });
  if (pagesSort !== 'none') {
    filteredResources.sort((a, b) => {
      const av = a.page_count ?? null;
      const bv = b.page_count ?? null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return pagesSort === 'asc' ? av - bv : bv - av;
    });
  }

  const totalPages = Math.ceil(filteredResources.length / itemsPerPage);
  const paginatedResources = filteredResources.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const filteredQuestions = questions.filter(q => {
    const matchesFilter = questionOcrFilter === 'all' || q.ocr_status === questionOcrFilter;
    const matchesWm =
      questionWatermarkFilter === 'all'
        ? true
        : questionWatermarkFilter === 'over_stamped'
          ? !!q.watermark_overstamped
          : questionWatermarkFilter === 'not_stamped'
            ? !q.watermark_status
            : q.watermark_status === questionWatermarkFilter;
    const matchesReadability =
      questionReadabilityFilter === 'all' ? true :
      questionReadabilityFilter === 'missing' ? !q.ocr_readability :
      q.ocr_readability === questionReadabilityFilter;
    const matchesPages = pageMatcher(q.page_count ?? null, questionPagesFilter);
    const matchesTeacher = textMatchesAny(questionTeacherFilter, [...(q.teacher_names ?? [])]);
    const matchesSchool = textMatchesAny(questionSchoolFilter, [...(q.school_names ?? [])]);
    const matchesBook = textMatchesAny(questionBookFilter, [...(q.books ?? [])]);

    // scanStatus derived from watermark integrity scan.
    const scanStatus =
      q.watermark_stamp_count === null || q.watermark_stamp_count === undefined
        ? 'unscanned'
        : q.watermark_overstamped
          ? 'corrupted'
          : 'clean';
    const matchesScanStatus = questionScanStatusFilter === 'all' || scanStatus === questionScanStatusFilter;

    const matchesSearch = textMatchesAny(questionSearchQuery ?? '', [
      q.data,
      q.chapters?.name,
      q.ocr_readability,
      q.ocr_status,
      q.watermark_status,
      q.ocr_text,
      q.ocr_text_proposed,
      ...(q.teacher_names ?? []),
      ...(q.school_names ?? []),
      ...(q.books ?? []),
      String(q.id),
    ]);
    return matchesFilter && matchesWm && matchesReadability && matchesPages
      && matchesTeacher && matchesSchool && matchesBook && matchesSearch && matchesScanStatus;
  });
  if (questionPagesSort !== 'none') {
    filteredQuestions.sort((a, b) => {
      const av = a.page_count ?? null;
      const bv = b.page_count ?? null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return questionPagesSort === 'asc' ? av - bv : bv - av;
    });
  }

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

  // Per-row AI suggestion cache so multiple cells on the same row share one call.
  const suggestionCache = new Map<string, Promise<ExtractedMetadata>>();
  const suggestForRow = (kind: 'resource' | 'question', id: number, ocrText: string | null) => {
    const key = `${kind}:${id}`;
    if (!ocrText) return Promise.resolve<ExtractedMetadata>({
      school_name: null, teacher_name: null, suggested_title: null,
      suggested_type_id: null, suggested_devoir_type_id: null, suggested_description: null,
      teacher_names: [], school_names: [], books: [],
    });
    let p = suggestionCache.get(key);
    if (!p) {
      p = extractMetadataFromOCR(ocrText, kind === 'resource' ? { resourceId: id } : { questionId: id })
        .then((r) => r.metadata);
      suggestionCache.set(key, p);
    }
    return p;
  };

  type CellField = 'title' | 'description' | 'teachers' | 'schools' | 'books' | 'types' | 'pages';
  const suggestCellValue = async (
    kind: 'resource' | 'question',
    row: { id: number; ocr_text: string | null },
    field: CellField,
  ): Promise<CellValue | null> => {
    if (field === 'pages') return null; // No AI for page count; user edits manually.
    const m = await suggestForRow(kind, row.id, row.ocr_text);
    if (field === 'title') return m.suggested_title ?? null;
    if (field === 'description') return m.suggested_description ?? null;
    if (field === 'teachers') return m.teacher_names ?? [];
    if (field === 'schools') return m.school_names ?? [];
    if (field === 'books') return m.books ?? [];
    if (field === 'types') {
      const ids: number[] = [];
      if (m.suggested_type_id) ids.push(m.suggested_type_id);
      return ids;
    }
    return null;
  };

  const saveResourceCell = async (row: ResourceRow, field: CellField, next: CellValue) => {
    const updates: Record<string, any> = {};
    if (field === 'title') {
      updates.title = ((next as string | null) ?? '').toString();
    } else if (field === 'description') {
      updates.description = ((next as string | null) ?? '').toString();
    } else if (field === 'teachers') {
      const arr = (next as string[]) ?? [];
      updates.teacher_names = arr;
      updates.teacher_name = arr[0] ?? null;
    } else if (field === 'schools') {
      const arr = (next as string[]) ?? [];
      updates.school_names = arr;
      updates.school_name = arr[0] ?? null;
    } else if (field === 'books') {
      const arr = (next as string[]) ?? [];
      updates.books = arr;
      updates.book = arr[0] ?? null;
    } else if (field === 'types') {
      const arr = (next as number[]) ?? [];
      updates.type_ids = arr;
      updates.type_id = arr[0] ?? null;
    } else if (field === 'pages') {
      updates.page_count = next == null ? null : (next as number);
    }
    // Always refresh readability so the badge stops being "missing".
    // Prefer OCR text; fall back to title + (new or existing) description.
    const nextDescription =
      field === 'description'
        ? ((next as string | null) ?? '').toString()
        : (row.description ?? '');
    const readabilitySource =
      (row.ocr_text && row.ocr_text.trim())
        ? row.ocr_text
        : [row.title ?? '', nextDescription].filter(Boolean).join('\n');
    updates.ocr_readability = computeReadability(readabilitySource);
    const { error } = await supabase.from('resources').update(updates).eq('id', row.id);
    if (error) throw error;
    setResources((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updates } : r)));
  };

  const saveQuestionCell = async (row: QuestionRow, field: CellField, next: CellValue) => {
    const updates: Record<string, any> = {};
    if (field === 'title') updates.data = ((next as string | null) ?? '').toString();
    else if (field === 'description') updates.data = ((next as string | null) ?? '').toString();
    else if (field === 'teachers') updates.teacher_names = (next as string[]) ?? [];
    else if (field === 'schools') updates.school_names = (next as string[]) ?? [];
    else if (field === 'books') {
      const arr = (next as string[]) ?? [];
      updates.books = arr;
      updates.book = arr[0] ?? null;
    } else if (field === 'types') {
      const arr = (next as number[]) ?? [];
      updates.type_ids = arr;
      updates.type_id = arr[0] ?? null;
    } else if (field === 'pages') {
      updates.page_count = next == null ? null : (next as number);
    }
    const nextData =
      field === 'title' || field === 'description'
        ? ((next as string | null) ?? '').toString()
        : (row.data ?? '');
    const readabilitySource =
      (row.ocr_text && row.ocr_text.trim()) ? row.ocr_text : nextData;
    updates.ocr_readability = computeReadability(readabilitySource);
    const { error } = await supabase.from('questions').update(updates).eq('id', row.id);
    if (error) throw error;
    setQuestions((prev) => prev.map((q) => (q.id === row.id ? { ...q, ...updates } : q)));
  };

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

            {/* Page Count Backfill */}
            <Card>
              <CardHeader>
                <CardTitle>Page Count Backfill</CardTitle>
                <CardDescription>
                  Compute and store total page count (PDF pages + 1 per image) for items missing this value.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => runPageCountBackfill({ skipPreviouslyFailed: true })}
                    disabled={pageBackfillStatus?.running}
                    variant="default"
                  >
                    {pageBackfillStatus?.running
                      ? `Processing ${pageBackfillStatus.label} ${pageBackfillStatus.done}/${pageBackfillStatus.total}…`
                      : 'Run page count backfill'}
                  </Button>
                  <Button
                    onClick={() => runPageCountBackfill({ skipPreviouslyFailed: false })}
                    disabled={pageBackfillStatus?.running}
                    variant="outline"
                  >
                    Retry previously failed
                  </Button>
                  <Button
                    onClick={resetPageBackfillCheckpoint}
                    disabled={pageBackfillStatus?.running}
                    variant="ghost"
                  >
                    Reset checkpoint
                  </Button>
                </div>
                {pageBackfillStatus && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>
                      {pageBackfillStatus.running ? 'Running' : pageBackfillStatus.label} —{' '}
                      {pageBackfillStatus.done}/{pageBackfillStatus.total}
                    </p>
                    <p>
                      <span className="text-green-600">{pageBackfillStatus.success} ok</span>
                      {' · '}
                      <span className="text-yellow-600">{pageBackfillStatus.partial} partial</span>
                      {' · '}
                      <span className="text-red-600">{pageBackfillStatus.failed} failed</span>
                    </p>
                    {pageBackfillStatus.total === 0 && !pageBackfillStatus.running && (
                      <p>No items needed backfilling.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Split PDF Health Audit (admin diagnostic) */}
            <PdfHealthAuditPanel />

            {/* Admin health monitoring (anchor target for #monitoring) */}
            <div id="monitoring">
              <MonitoringPanel />
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
                            {/* Bulk "Extract All Metadata" removed — metadata extraction now requires per-row review. */}
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
                          <div className="h-[250px] w-full overflow-hidden relative">
                            <ChartContainer config={{
                              completed: { label: 'Completed', color: 'hsl(var(--chart-2))' },
                              pending: { label: 'Pending', color: 'hsl(var(--chart-3))' },
                              failed: { label: 'Failed', color: 'hsl(var(--chart-4))' },
                              not_applicable: { label: 'Not Applicable', color: 'hsl(var(--muted))' }
                            }} className="!aspect-auto h-full w-full">
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
                          <div className="flex flex-wrap gap-2 mb-4 items-center">
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
                            <Select value={watermarkFilter} onValueChange={setWatermarkFilter}>
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Watermark filter" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Watermark</SelectItem>
                                <SelectItem value="not_stamped">Watermark: Not stamped</SelectItem>
                                <SelectItem value="completed">Watermark: Completed</SelectItem>
                                <SelectItem value="partial">Watermark: Partial</SelectItem>
                                <SelectItem value="pending">Watermark: Pending</SelectItem>
                                <SelectItem value="in_progress">Watermark: In progress</SelectItem>
                                <SelectItem value="failed">Watermark: Failed</SelectItem>
                                <SelectItem value="not_applicable">Watermark: N/A</SelectItem>
                                <SelectItem value="over_stamped">Watermark: Over-stamped</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={scanStatusFilter} onValueChange={setScanStatusFilter}>
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Scan status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Scan Status</SelectItem>
                                <SelectItem value="unscanned">Unscanned</SelectItem>
                                <SelectItem value="clean">Clean</SelectItem>
                                <SelectItem value="corrupted">Corrupted</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={sourceFilter} onValueChange={setSourceFilter}>
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Source filter" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Sources</SelectItem>
                                <SelectItem value="has_link">Source: Link</SelectItem>
                                <SelectItem value="has_book_name">Source: Book name</SelectItem>
                                <SelectItem value="missing">Source: Missing</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={readabilityFilter} onValueChange={setReadabilityFilter}>
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Readability filter" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Readability</SelectItem>
                                <SelectItem value="high">Readability: High</SelectItem>
                                <SelectItem value="medium">Readability: Medium</SelectItem>
                                <SelectItem value="low">Readability: Low</SelectItem>
                                <SelectItem value="unreadable">Readability: Unreadable</SelectItem>
                                <SelectItem value="missing">Readability: Missing</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={descriptionFilter} onValueChange={setDescriptionFilter}>
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Description" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Descriptions</SelectItem>
                                <SelectItem value="has">Description: Present</SelectItem>
                                <SelectItem value="missing">Description: Missing</SelectItem>
                                <SelectItem value="has_proposal">Description: AI proposal</SelectItem>
                                <SelectItem value="applied">Description: AI applied</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={pagesFilter} onValueChange={setPagesFilter}>
                              <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="Pages" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Pages</SelectItem>
                                <SelectItem value="single">Pages: Single</SelectItem>
                                <SelectItem value="multi">Pages: Multi</SelectItem>
                                <SelectItem value="none">Pages: Unknown</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={pagesSort} onValueChange={setPagesSort}>
                              <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="Sort pages" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sort: Default</SelectItem>
                                <SelectItem value="asc">Pages ↑</SelectItem>
                                <SelectItem value="desc">Pages ↓</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                              <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="Type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {resourceTypes.map((t) => (
                                  <SelectItem key={t.id} value={String(t.id)}>{t.type}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Teacher"
                              value={teacherFilter}
                              onChange={(e) => setTeacherFilter(e.target.value)}
                              className="w-[140px]"
                            />
                            <Input
                              placeholder="School"
                              value={schoolFilter}
                              onChange={(e) => setSchoolFilter(e.target.value)}
                              className="w-[140px]"
                            />
                            <Input
                              placeholder="Book"
                              value={bookFilter}
                              onChange={(e) => setBookFilter(e.target.value)}
                              className="w-[140px]"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleWatermarkAllResources}
                              disabled={isProcessingWatermarkBatch}
                              title="Watermark all eligible resources"
                            >
                              {isProcessingWatermarkBatch ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Stamp className="mr-2 h-4 w-4" />
                              )}
                              Watermark all
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleScanAllResources}
                              disabled={isScanningWmBatch}
                              title="Scan watermarked PDFs for over-stamping"
                            >
                              {isScanningWmBatch ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Search className="mr-2 h-4 w-4" />
                              )}
                              Scan integrity
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleRollbackAllOverstampedResources}
                              disabled={isRollbackBatch}
                              title="Rollback every over-stamped resource to its earliest healthy version"
                            >
                              {isRollbackBatch ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <History className="mr-2 h-4 w-4" />
                              )}
                              Rollback over-stamped
                            </Button>
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
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 p-2 rounded-md bg-muted/40 border">
                              <span className="text-sm font-medium">
                                {selectedResourceIds.size} selected
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                {/* Bulk AI metadata chips removed — use the per-row Sparkles button to review each item. */}
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
                                      <TableHead>Description</TableHead>
                                      <TableHead>Chapter</TableHead>
                                      <TableHead>Teachers</TableHead>
                                      <TableHead>Schools</TableHead>
                                      <TableHead>Books</TableHead>
                                     <TableHead>From</TableHead>
                                      <TableHead>Types</TableHead>
                                      <TableHead>Pages</TableHead>
                                      <TableHead>Per-page</TableHead>
                                      <TableHead>OCR Status</TableHead>
                                      <TableHead>Readability</TableHead>
                                      <TableHead>Watermark</TableHead>
                                      <TableHead>Scan status</TableHead>
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
                                              <MetaCell
                                                variant="text"
                                                value={resource.title ?? ''}
                                                canSuggest={!!resource.ocr_text}
                                                onSuggest={() => suggestCellValue('resource', resource, 'title')}
                                                onSave={(v) => saveResourceCell(resource, 'title', v)}
                                              />
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
                                            <MetaCell
                                              variant="longText"
                                              value={resource.description ?? ''}
                                              canSuggest={!!resource.ocr_text}
                                              onSuggest={() => suggestCellValue('resource', resource, 'description')}
                                              onSave={(v) => saveResourceCell(resource, 'description', v)}
                                            />
                                            {(() => {
                                              const tier = computeReadability(resource.description ?? '');
                                              return (
                                                <Badge
                                                  variant="outline"
                                                  className={`mt-1 text-[10px] ${readabilityBadgeClass(tier)}`}
                                                  title="Description readability"
                                                >
                                                  Desc: {READABILITY_LABEL[tier]}
                                                </Badge>
                                              );
                                            })()}
                                          </TableCell>
                                          <TableCell>
                                            {resource.chapters?.name || 'N/A'}
                                          </TableCell>
                                          <TableCell>
                                            <MetaCell
                                              variant="array"
                                              value={resource.teacher_names ?? []}
                                              canSuggest={!!resource.ocr_text}
                                              onSuggest={() => suggestCellValue('resource', resource, 'teachers')}
                                              onSave={(v) => saveResourceCell(resource, 'teachers', v)}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <MetaCell
                                              variant="array"
                                              value={resource.school_names ?? []}
                                              canSuggest={!!resource.ocr_text}
                                              onSuggest={() => suggestCellValue('resource', resource, 'schools')}
                                              onSave={(v) => saveResourceCell(resource, 'schools', v)}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <MetaCell
                                              variant="array"
                                              value={resource.books ?? []}
                                              canSuggest={!!resource.ocr_text}
                                              onSuggest={() => suggestCellValue('resource', resource, 'books')}
                                              onSave={(v) => saveResourceCell(resource, 'books', v)}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <SourceLinkCell
                                              resourceId={resource.id}
                                              value={resource.source_link ?? null}
                                              onSaved={(next) => {
                                                setResources((prev) => prev.map((x) => x.id === resource.id ? { ...x, source_link: next } : x));
                                              }}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <MetaCell
                                              variant="typeIds"
                                              value={resource.type_ids ?? []}
                                              resourceTypes={resourceTypes}
                                              canSuggest={!!resource.ocr_text}
                                              onSuggest={() => suggestCellValue('resource', resource, 'types')}
                                              onSave={(v) => saveResourceCell(resource, 'types', v)}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <MetaCell
                                              variant="number"
                                              value={resource.page_count ?? null}
                                              canSuggest={false}
                                              onSuggest={() => suggestCellValue('resource', resource, 'pages')}
                                              onSave={(v) => saveResourceCell(resource, 'pages', v)}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <PdfSplitCell
                                              kind="resource"
                                              row={{ id: resource.id, data: resource.data, chapter_id: resource.chapter_id }}
                                              onChanged={(newData) =>
                                                setResources((prev) =>
                                                  prev.map((r) =>
                                                    r.id === resource.id ? { ...r, data: newData } : r,
                                                  ),
                                                )
                                              }
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <OcrStatusEditor
                                              table="resources"
                                              rowId={resource.id}
                                              status={resource.ocr_status as OcrStatus}
                                              onChanged={(next) =>
                                                setResources((prev) =>
                                                  prev.map((r) =>
                                                    r.id === resource.id ? { ...r, ocr_status: next } : r,
                                                  ),
                                                )
                                              }
                                            />
                                          </TableCell>
                                          <TableCell>
                                            {resource.ocr_readability ? (
                                              <Badge variant="outline" className={readabilityBadgeClass(resource.ocr_readability as OcrReadability)}>
                                                {READABILITY_LABEL[resource.ocr_readability as OcrReadability] ?? resource.ocr_readability}
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline" className="text-muted-foreground">—</Badge>
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            <WatermarkStatusEditor
                                              table="resources"
                                              rowId={resource.id}
                                              status={resource.watermark_status as WatermarkStatus}
                                              pagesWatermarked={resource.pages_watermarked ?? 0}
                                              pageCount={resource.page_count ?? null}
                                              onChanged={(next, pages) =>
                                                setResources((prev) =>
                                                  prev.map((r) =>
                                                    r.id === resource.id
                                                      ? { ...r, watermark_status: next, pages_watermarked: pages ?? r.pages_watermarked ?? 0 }
                                                      : r,
                                                  ),
                                                )
                                              }
                                            />
                                            {urlsHaveOcrable(resource.data) && (
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 mt-1"
                                                onClick={() => handleWatermarkSingleResource(resource.id)}
                                                disabled={processingWatermarkId === resource.id}
                                                title="Watermark this resource now"
                                              >
                                                {processingWatermarkId === resource.id ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <Stamp className="h-3 w-3 mr-1" />
                                                )}
                                                Stamp
                                              </Button>
                                            )}
                                            {resource.watermark_overstamped && (
                                              <Badge variant="destructive" className="mt-1 block w-fit">
                                                Over-stamped ×{resource.watermark_stamp_count ?? '?'}
                                              </Badge>
                                            )}
                                            {urlsHaveOcrable(resource.data) && (
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 mt-1"
                                                onClick={() => setRollbackTarget({ table: 'resources', id: resource.id })}
                                                title="Restore a healthy earlier version from Archive.org history"
                                              >
                                                <History className="h-3 w-3 mr-1" />
                                                Rollback
                                              </Button>
                                            )}
                                            {urlsHaveOcrable(resource.data) && (
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 mt-1"
                                                onClick={() => handleScanResource(resource.id)}
                                                disabled={scanningWmId === resource.id}
                                                title="Scan watermark integrity (count stamps per page)"
                                              >
                                                {scanningWmId === resource.id ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <Search className="h-3 w-3 mr-1" />
                                                )}
                                                Scan
                                              </Button>
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            {(() => {
                                              const scanStatus =
                                                resource.watermark_stamp_count === null || resource.watermark_stamp_count === undefined
                                                  ? 'unscanned'
                                                  : resource.watermark_overstamped
                                                    ? 'corrupted'
                                                    : 'clean';
                                              return (
                                                <Badge
                                                  variant={scanStatus === 'corrupted' ? 'destructive' : 'outline'}
                                                  className={
                                                    scanStatus === 'clean'
                                                      ? 'border-green-500 text-green-600'
                                                      : scanStatus === 'unscanned'
                                                        ? 'text-muted-foreground'
                                                        : ''
                                                  }
                                                >
                                                  {scanStatus.charAt(0).toUpperCase() + scanStatus.slice(1)}
                                                </Badge>
                                              );
                                            })()}
                                          </TableCell>
                                          <TableCell>
                                            <OcrTextEditor
                                              table="resources"
                                              rowId={resource.id}
                                              text={resource.ocr_text ?? null}
                                              readability={resource.ocr_readability ?? null}
                                              onChanged={(next) =>
                                                setResources((prev) =>
                                                  prev.map((r) =>
                                                    r.id === resource.id ? { ...r, ocr_text: next } : r,
                                                  ),
                                                )
                                              }
                                            />
                                            {resource.ocr_text_proposed && (
                                              <div className="mt-1">
                                                <OcrReviewButton
                                                  table="resources"
                                                  rowId={resource.id}
                                                  currentText={resource.ocr_text ?? null}
                                                  proposedText={resource.ocr_text_proposed ?? null}
                                                  proposedStatus={resource.ocr_text_proposed_status ?? null}
                                                  proposedReadability={resource.ocr_text_proposed_readability ?? null}
                                                  currentReadability={resource.ocr_readability ?? null}
                                                  onResolved={(patch) =>
                                                    setResources((prev) =>
                                                      prev.map((r) =>
                                                        r.id === resource.id
                                                          ? {
                                                              ...r,
                                                              ...(patch.ocr_text !== null && patch.ocr_status !== null
                                                                ? {
                                                                    ocr_text: patch.ocr_text,
                                                                    ocr_status: patch.ocr_status,
                                                                    ocr_readability: patch.ocr_readability,
                                                                  }
                                                                : {}),
                                                              ocr_text_proposed: null,
                                                              ocr_text_proposed_at: null,
                                                              ocr_text_proposed_readability: null,
                                                              ocr_text_proposed_status: null,
                                                            }
                                                          : r,
                                                      ),
                                                    )
                                                  }
                                                />
                                              </div>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                              {resource.ocr_status === 'completed' && resource.ocr_text && (
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => openMetadataReview('resource', resource.id)}
                                                  disabled={extractingMetadataId === resource.id}
                                                  title="Extract metadata with AI (review before applying)"
                                                >
                                                  {extractingMetadataId === resource.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                  ) : (
                                                    <Sparkles className="h-4 w-4" />
                                                  )}
                                                </Button>
                                              )}
                                              <DescriptionAiButton
                                                resourceId={resource.id}
                                                hasOcrText={!!(resource.ocr_text && resource.ocr_text.trim().length > 0)}
                                                currentDescription={resource.description ?? null}
                                                proposedDescription={resource.description_proposed ?? null}
                                                proposedModel={resource.description_proposed_model ?? null}
                                                onUpdated={(patch) =>
                                                  setResources((prev) =>
                                                    prev.map((r) =>
                                                      r.id === resource.id
                                                        ? {
                                                            ...r,
                                                            ...(patch.description !== undefined
                                                              ? { description: patch.description ?? '' }
                                                              : {}),
                                                            description_proposed: patch.description_proposed,
                                                            description_proposed_at: patch.description_proposed_at,
                                                            description_proposed_status: patch.description_proposed_status,
                                                            description_proposed_model: patch.description_proposed_model,
                                                          }
                                                        : r,
                                                    ),
                                                  )
                                                }
                                              />
                                              <Button
                                                size="sm"
                                                variant={canProcess ? 'outline' : 'ghost'}
                                                onClick={() =>
                                                  setOcrScanTarget({
                                                    kind: 'resource',
                                                    id: resource.id,
                                                    context: {
                                                      chapterName: resource.chapters?.name ?? null,
                                                      subjectName: resource.chapters?.subjects?.name ?? null,
                                                      className: resource.chapters?.classes?.name ?? null,
                                                      book: (resource.books && resource.books[0]) || resource.school_name || null,
                                                      teacher: (resource.teacher_names && resource.teacher_names[0]) || resource.teacher_name || null,
                                                      school: (resource.school_names && resource.school_names[0]) || resource.school_name || null,
                                                      resourceType: resource.resource_types?.type ?? null,
                                                      currentStatus: resource.ocr_status ?? null,
                                                    },
                                                  })
                                                }
                                                disabled={processingId === resource.id}
                                                title="Run OCR with context & options"
                                              >
                                                {processingId === resource.id ? (
                                                  <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                  <Layers className="h-4 w-4" />
                                                )}
                                                <span className="ml-1 hidden md:inline">OCR…</span>
                                              </Button>
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
                          <div className="h-[250px] w-full overflow-hidden relative">
                            <ChartContainer config={{
                              completed: { label: 'Completed', color: 'hsl(var(--chart-2))' },
                              pending: { label: 'Pending', color: 'hsl(var(--chart-3))' },
                              failed: { label: 'Failed', color: 'hsl(var(--chart-4))' },
                              not_applicable: { label: 'Not Applicable', color: 'hsl(var(--muted))' }
                            }} className="!aspect-auto h-full w-full">
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
                          <div className="flex flex-wrap gap-2 mb-4 items-center">
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
                            <Select value={questionWatermarkFilter} onValueChange={setQuestionWatermarkFilter}>
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Watermark filter" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Watermark</SelectItem>
                                <SelectItem value="not_stamped">Watermark: Not stamped</SelectItem>
                                <SelectItem value="completed">Watermark: Completed</SelectItem>
                                <SelectItem value="partial">Watermark: Partial</SelectItem>
                                <SelectItem value="pending">Watermark: Pending</SelectItem>
                                <SelectItem value="in_progress">Watermark: In progress</SelectItem>
                                <SelectItem value="failed">Watermark: Failed</SelectItem>
                                <SelectItem value="not_applicable">Watermark: N/A</SelectItem>
                                <SelectItem value="over_stamped">Watermark: Over-stamped</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={questionScanStatusFilter} onValueChange={setQuestionScanStatusFilter}>
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Scan status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Scan Status</SelectItem>
                                <SelectItem value="unscanned">Unscanned</SelectItem>
                                <SelectItem value="clean">Clean</SelectItem>
                                <SelectItem value="corrupted">Corrupted</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={questionReadabilityFilter} onValueChange={setQuestionReadabilityFilter}>
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Readability filter" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Readability</SelectItem>
                                <SelectItem value="high">Readability: High</SelectItem>
                                <SelectItem value="medium">Readability: Medium</SelectItem>
                                <SelectItem value="low">Readability: Low</SelectItem>
                                <SelectItem value="unreadable">Readability: Unreadable</SelectItem>
                                <SelectItem value="missing">Readability: Missing</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={questionPagesFilter} onValueChange={setQuestionPagesFilter}>
                              <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="Pages" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Pages</SelectItem>
                                <SelectItem value="single">Pages: Single</SelectItem>
                                <SelectItem value="multi">Pages: Multi</SelectItem>
                                <SelectItem value="none">Pages: Unknown</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={questionPagesSort} onValueChange={setQuestionPagesSort}>
                              <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="Sort pages" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sort: Default</SelectItem>
                                <SelectItem value="asc">Pages ↑</SelectItem>
                                <SelectItem value="desc">Pages ↓</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Teacher"
                              value={questionTeacherFilter}
                              onChange={(e) => setQuestionTeacherFilter(e.target.value)}
                              className="w-[140px]"
                            />
                            <Input
                              placeholder="School"
                              value={questionSchoolFilter}
                              onChange={(e) => setQuestionSchoolFilter(e.target.value)}
                              className="w-[140px]"
                            />
                            <Input
                              placeholder="Book"
                              value={questionBookFilter}
                              onChange={(e) => setQuestionBookFilter(e.target.value)}
                              className="w-[140px]"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleWatermarkAllQuestions}
                              disabled={isProcessingWatermarkQuestionBatch}
                              title="Watermark all eligible questions"
                            >
                              {isProcessingWatermarkQuestionBatch ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Stamp className="mr-2 h-4 w-4" />
                              )}
                              Watermark all
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleScanAllQuestions}
                              disabled={isScanningWmQuestionBatch}
                              title="Scan watermarked PDFs for over-stamping"
                            >
                              {isScanningWmQuestionBatch ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Search className="mr-2 h-4 w-4" />
                              )}
                              Scan integrity
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleRollbackAllOverstampedQuestions}
                              disabled={isRollbackQuestionBatch}
                              title="Rollback every over-stamped question to its earliest healthy version"
                            >
                              {isRollbackQuestionBatch ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <History className="mr-2 h-4 w-4" />
                              )}
                              Rollback over-stamped
                            </Button>
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
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 p-2 rounded-md bg-muted/40 border">
                              <span className="text-sm font-medium">
                                {selectedQuestionIds.size} selected
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                {/* Bulk AI metadata chips removed — use the per-row Sparkles button to review each item. */}
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
                                      <TableHead>Teachers</TableHead>
                                      <TableHead>Schools</TableHead>
                                      <TableHead>Books</TableHead>
                                      <TableHead>Types</TableHead>
                                      <TableHead>Pages</TableHead>
                                      <TableHead>Per-page</TableHead>
                                      <TableHead>OCR Status</TableHead>
                                      <TableHead>Watermark</TableHead>
                                      <TableHead>Scan status</TableHead>
                                      <TableHead>Readability</TableHead>
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
                                            {(() => {
                                              const tier = computeReadability(question.data ?? '');
                                              return (
                                                <Badge
                                                  variant="outline"
                                                  className={`mt-1 text-[10px] ${readabilityBadgeClass(tier)}`}
                                                  title="Description readability"
                                                >
                                                  Desc: {READABILITY_LABEL[tier]}
                                                </Badge>
                                              );
                                            })()}
                                          </TableCell>
                                          <TableCell>
                                            {question.chapters?.name || 'N/A'}
                                          </TableCell>
                                          <TableCell>
                                            <MetaCell
                                              variant="array"
                                              value={question.teacher_names ?? []}
                                              canSuggest={!!question.ocr_text}
                                              onSuggest={() => suggestCellValue('question', { id: question.id, ocr_text: question.ocr_text ?? null }, 'teachers')}
                                              onSave={(v) => saveQuestionCell(question, 'teachers', v)}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <MetaCell
                                              variant="array"
                                              value={question.school_names ?? []}
                                              canSuggest={!!question.ocr_text}
                                              onSuggest={() => suggestCellValue('question', { id: question.id, ocr_text: question.ocr_text ?? null }, 'schools')}
                                              onSave={(v) => saveQuestionCell(question, 'schools', v)}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <MetaCell
                                              variant="array"
                                              value={question.books ?? []}
                                              canSuggest={!!question.ocr_text}
                                              onSuggest={() => suggestCellValue('question', { id: question.id, ocr_text: question.ocr_text ?? null }, 'books')}
                                              onSave={(v) => saveQuestionCell(question, 'books', v)}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <MetaCell
                                              variant="typeIds"
                                              value={question.type_ids ?? []}
                                              resourceTypes={resourceTypes}
                                              canSuggest={!!question.ocr_text}
                                              onSuggest={() => suggestCellValue('question', { id: question.id, ocr_text: question.ocr_text ?? null }, 'types')}
                                              onSave={(v) => saveQuestionCell(question, 'types', v)}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <MetaCell
                                              variant="number"
                                              value={question.page_count ?? null}
                                              canSuggest={false}
                                              onSuggest={() => suggestCellValue('question', { id: question.id, ocr_text: question.ocr_text ?? null }, 'pages')}
                                              onSave={(v) => saveQuestionCell(question, 'pages', v)}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <PdfSplitCell
                                              kind="question"
                                              row={{ id: question.id, data: question.data, chapter_id: question.chapter_id }}
                                              urls={extractMediaFromText(question.data).media.map((m) => m.url)}
                                              onChanged={(newText) =>
                                                setQuestions((prev) =>
                                                  prev.map((q) =>
                                                    q.id === question.id ? { ...q, data: newText } : q,
                                                  ),
                                                )
                                              }
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <OcrStatusEditor
                                              table="questions"
                                              rowId={question.id}
                                              status={question.ocr_status as OcrStatus}
                                              onChanged={(next) =>
                                                setQuestions((prev) =>
                                                  prev.map((q) =>
                                                    q.id === question.id ? { ...q, ocr_status: next } : q,
                                                  ),
                                                )
                                              }
                                            />
                                          </TableCell>
                                          <TableCell>
                                            <WatermarkStatusEditor
                                              table="questions"
                                              rowId={question.id}
                                              status={question.watermark_status as WatermarkStatus}
                                              pagesWatermarked={question.pages_watermarked ?? 0}
                                              pageCount={question.page_count ?? null}
                                              onChanged={(next, pages) =>
                                                setQuestions((prev) =>
                                                  prev.map((q) =>
                                                    q.id === question.id
                                                      ? { ...q, watermark_status: next, pages_watermarked: pages ?? q.pages_watermarked ?? 0 }
                                                      : q,
                                                  ),
                                                )
                                              }
                                            />
                                            {textHasOcrableUrl(question.data) && (
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 mt-1"
                                                onClick={() => handleWatermarkSingleQuestion(question.id)}
                                                disabled={processingWatermarkQuestionId === question.id}
                                                title="Watermark this question now"
                                              >
                                                {processingWatermarkQuestionId === question.id ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <Stamp className="h-3 w-3 mr-1" />
                                                )}
                                                Stamp
                                              </Button>
                                            )}
                                            {question.watermark_overstamped && (
                                              <Badge variant="destructive" className="mt-1 block w-fit">
                                                Over-stamped ×{question.watermark_stamp_count ?? '?'}
                                              </Badge>
                                            )}
                                            {textHasOcrableUrl(question.data) && (
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 mt-1"
                                                onClick={() => setRollbackTarget({ table: 'questions', id: question.id })}
                                                title="Restore a healthy earlier version from Archive.org history"
                                              >
                                                <History className="h-3 w-3 mr-1" />
                                                Rollback
                                              </Button>
                                            )}
                                            {textHasOcrableUrl(question.data) && (
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 mt-1"
                                                onClick={() => handleScanQuestion(question.id)}
                                                disabled={scanningWmQuestionId === question.id}
                                                title="Scan watermark integrity (count stamps per page)"
                                              >
                                                {scanningWmQuestionId === question.id ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <Search className="h-3 w-3 mr-1" />
                                                )}
                                                Scan
                                              </Button>
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            {(() => {
                                              const scanStatus =
                                                question.watermark_stamp_count === null || question.watermark_stamp_count === undefined
                                                  ? 'unscanned'
                                                  : question.watermark_overstamped
                                                    ? 'corrupted'
                                                    : 'clean';
                                              return (
                                                <Badge
                                                  variant={scanStatus === 'corrupted' ? 'destructive' : 'outline'}
                                                  className={
                                                    scanStatus === 'clean'
                                                      ? 'border-green-500 text-green-600'
                                                      : scanStatus === 'unscanned'
                                                        ? 'text-muted-foreground'
                                                        : ''
                                                  }
                                                >
                                                  {scanStatus.charAt(0).toUpperCase() + scanStatus.slice(1)}
                                                </Badge>
                                              );
                                            })()}
                                          </TableCell>
                                          <TableCell>
                                            {question.ocr_readability ? (
                                              <Badge variant="outline" className={readabilityBadgeClass(question.ocr_readability as OcrReadability)}>
                                                {READABILITY_LABEL[question.ocr_readability as OcrReadability] ?? question.ocr_readability}
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline" className="text-muted-foreground">—</Badge>
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            <OcrTextEditor
                                              table="questions"
                                              rowId={question.id}
                                              text={question.ocr_text ?? null}
                                              readability={question.ocr_readability ?? null}
                                              onChanged={(next) =>
                                                setQuestions((prev) =>
                                                  prev.map((q) =>
                                                    q.id === question.id ? { ...q, ocr_text: next } : q,
                                                  ),
                                                )
                                              }
                                            />
                                            {question.ocr_text_proposed && (
                                              <div className="mt-1">
                                                <OcrReviewButton
                                                  table="questions"
                                                  rowId={question.id}
                                                  currentText={question.ocr_text ?? null}
                                                  proposedText={question.ocr_text_proposed ?? null}
                                                  proposedStatus={question.ocr_text_proposed_status ?? null}
                                                  proposedReadability={question.ocr_text_proposed_readability ?? null}
                                                  currentReadability={question.ocr_readability ?? null}
                                                  onResolved={(patch) =>
                                                    setQuestions((prev) =>
                                                      prev.map((q) =>
                                                        q.id === question.id
                                                          ? {
                                                              ...q,
                                                              ...(patch.ocr_text !== null && patch.ocr_status !== null
                                                                ? {
                                                                    ocr_text: patch.ocr_text,
                                                                    ocr_status: patch.ocr_status,
                                                                    ocr_readability: patch.ocr_readability,
                                                                  }
                                                                : {}),
                                                              ocr_text_proposed: null,
                                                              ocr_text_proposed_at: null,
                                                              ocr_text_proposed_readability: null,
                                                              ocr_text_proposed_status: null,
                                                            }
                                                          : q,
                                                      ),
                                                    )
                                                  }
                                                />
                                              </div>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                              {question.ocr_status === 'completed' && question.ocr_text && (
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => openMetadataReview('question', question.id)}
                                                  disabled={extractingMetadataId === question.id}
                                                  title="Extract metadata with AI (review before applying)"
                                                >
                                                  {extractingMetadataId === question.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                  ) : (
                                                    <Sparkles className="h-4 w-4" />
                                                  )}
                                                </Button>
                                              )}
                                              <Button
                                                size="sm"
                                                variant={canProcess ? 'outline' : 'ghost'}
                                                onClick={() =>
                                                  setOcrScanTarget({
                                                    kind: 'question',
                                                    id: question.id,
                                                    context: {
                                                      chapterName: question.chapters?.name ?? null,
                                                      subjectName: question.chapters?.subjects?.name ?? null,
                                                      className: question.chapters?.classes?.name ?? null,
                                                      book: (question.books && question.books[0]) || null,
                                                      teacher: (question.teacher_names && question.teacher_names[0]) || null,
                                                      school: (question.school_names && question.school_names[0]) || null,
                                                      currentStatus: question.ocr_status ?? null,
                                                    },
                                                  })
                                                }
                                                disabled={processingQuestionId === question.id}
                                                title="Run OCR with context & options"
                                              >
                                                {processingQuestionId === question.id ? (
                                                  <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                  <Layers className="h-4 w-4" />
                                                )}
                                                <span className="ml-1 hidden md:inline">OCR…</span>
                                              </Button>
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
            <AiGenerationsCard />
            <ReportsCard />
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
      <MetadataReviewDialog
        open={!!metadataReview}
        target={metadataReview}
        applying={applyingReview}
        onDiscard={() => setMetadataReview(null)}
        onApply={applyMetadataReview}
      />
      <OcrScanDialog
        open={!!ocrScanTarget}
        onOpenChange={(open) => {
          if (!open && !ocrScanRunning) setOcrScanTarget(null);
        }}
        kind={ocrScanTarget?.kind ?? 'resource'}
        id={ocrScanTarget?.id ?? null}
        context={ocrScanTarget?.context ?? {}}
        running={ocrScanRunning}
        onRun={async ({ mode, langs, psm, contextHint, force }) => {
          if (!ocrScanTarget) return;
          const { kind, id, context } = ocrScanTarget;
          if (context.currentStatus === 'completed' && !force) {
            toast.error('Existing OCR present — enable "Overwrite" to force retry.');
            return;
          }
          setOcrScanRunning(true);
          try {
            if (kind === 'resource') {
              await handleProcessSingle(id, mode, { langs, psm, contextHint });
            } else {
              await handleProcessSingleQuestion(id, mode, { langs, psm, contextHint });
            }
          } finally {
            setOcrScanRunning(false);
            setOcrScanTarget(null);
          }
        }}
      />
      {rollbackTarget && (
        <RollbackVersionDialog
          open={!!rollbackTarget}
          onOpenChange={(v) => !v && setRollbackTarget(null)}
          table={rollbackTarget.table}
          rowId={rollbackTarget.id}
          onRestored={() => {
            if (rollbackTarget.table === 'resources') {
              fetchResources(selectedClass, selectedSubject, selectedChapter);
            } else {
              fetchQuestions(selectedClass, selectedSubject, selectedChapter);
            }
          }}
        />
      )}
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
