import React, { useState, useEffect } from 'react';
import { Search, X, FileText, HelpCircle, MessageSquare, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BookBadge } from '@/components/BookBadge';
import { BookAutocomplete } from '@/components/BookAutocomplete';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { normalizeText } from '@/utils/textHelpers';

interface SearchResult {
  id: number;
  type: 'chapter' | 'resource' | 'question' | 'answer';
  title: string;
  description?: string;
  matchSnippet?: string;
  matchType?: 'title' | 'description' | 'content' | 'book';
  chapterId?: number;
  questionId?: number;
  subjectName?: string;
  resourceType?: string;
  hasCorrection?: boolean;
  schoolName?: string;
  teacherName?: string;
  book?: string | null;
  smartMatch?: boolean;
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  publicMode?: boolean;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ open, onClose, publicMode = false }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'chapters' | 'resources' | 'questions' | 'answers'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [chapterFilter, setChapterFilter] = useState<string>('all');
  const [resourceTypeFilters, setResourceTypeFilters] = useState<Record<number, boolean>>({});
  const [withCorrectionOnly, setWithCorrectionOnly] = useState(false);
  const [searchInOcrContent, setSearchInOcrContent] = useState(true);
  const [searchInQuestionOcrContent, setSearchInQuestionOcrContent] = useState(true);
  const [bookFilter, setBookFilter] = useState('');
  const [subjects, setSubjects] = useState<Array<{ id: number; name: string }>>([]);
  const [chapters, setChapters] = useState<Array<{ id: number; name: string }>>([]);
  const [resourceTypes, setResourceTypes] = useState<Array<{ id: number; type: string }>>([]);
  const [userClassId, setUserClassId] = useState<number | null>(null);
  const [classes, setClasses] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const navigate = useNavigate();

  // Effective class ID - explicit "all" means search everywhere; an explicit class id
  // is honored; otherwise (uninitialized) fall back to the user's own class in private mode.
  const effectiveClassId =
    selectedClassId === 'all'
      ? null
      : selectedClassId
        ? parseInt(selectedClassId)
        : (publicMode ? null : userClassId);

  useEffect(() => {
    if (open) {
      fetchClasses();
      if (!publicMode) {
        fetchUserClass();
      }
    }
  }, [open, publicMode]);

  useEffect(() => {
    fetchSubjects();
    fetchResourceTypes();
  }, [effectiveClassId]);

  useEffect(() => {
    if (subjectFilter !== 'all') {
      fetchChapters(parseInt(subjectFilter));
    } else {
      setChapters([]);
      setChapterFilter('all');
    }
  }, [subjectFilter]);

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('id, name')
      .eq('hidden', false)
      .order('name');
    setClasses(data || []);
  };

  const fetchUserClass = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('class_id')
      .eq('user_id', user.id)
      .single();

    if (profile) {
      setUserClassId(profile.class_id);
    }
  };

  const fetchSubjects = async () => {
    let query = supabase
      .from('subjects')
      .select('id, name, class_id')
      .eq('deleted', false)
      .order('name');

    if (effectiveClassId) {
      query = query.eq('class_id', effectiveClassId);
    }

    const { data: subjectsData } = await query;
    setSubjects(subjectsData || []);
  };

  const fetchChapters = async (subjectId: number) => {
    const { data: chaptersData } = await supabase
      .from('chapters')
      .select('id, name')
      .eq('subject_id', subjectId)
      .eq('deleted', false)
      .order('name');

    setChapters(chaptersData || []);
  };

  const fetchResourceTypes = async () => {
    const { data: typesData } = await supabase
      .from('resource_types')
      .select('id, type')
      .order('id');

    setResourceTypes(typesData || []);
    
    // Initialize all resource types as unchecked
    const initialFilters: Record<number, boolean> = {};
    typesData?.forEach(type => {
      initialFilters[type.id] = false;
    });
    setResourceTypeFilters(initialFilters);
  };

  useEffect(() => {
    const effectiveQuery = query.length >= 2 ? query : (bookFilter.trim().length >= 1 ? bookFilter.trim() : '');
    if (effectiveQuery.length < 1) {
      setResults([]);
      return;
    }
    const isBookOnlyMode = query.length < 2 && bookFilter.trim().length >= 1;

    const searchTimeout = setTimeout(async () => {
      setLoading(true);
      try {
        const searchResults: SearchResult[] = [];
        const normBook = bookFilter ? normalizeText(bookFilter.trim()) : '';
        const matchesBookFilter = (book: string | null | undefined) =>
          !normBook || (book && normalizeText(book).includes(normBook));

        // Search chapters
        if ((filter === 'all' || filter === 'chapters') && !isBookOnlyMode && !normBook) {
          const { data: chaptersData } = await supabase.rpc(
            'search_chapters_normalized',
            {
              search_query: effectiveQuery,
              p_class_id: effectiveClassId ?? null,
              p_subject_id:
                subjectFilter !== 'all' ? parseInt(subjectFilter) : null,
            },
          );
          let chapters = chaptersData || [];
          if (chapterFilter !== 'all') {
            chapters = chapters.filter(
              (c: any) => c.id === parseInt(chapterFilter),
            );
          }
          searchResults.push(
            ...chapters.slice(0, 10).map((ch: any) => ({
              id: ch.id,
              type: 'chapter' as const,
              title: ch.name,
              subjectName: ch.subject_name,
            })),
          );
        }

        // Search resources
        if (filter === 'all' || filter === 'resources') {
          // Filter by resource types
          const selectedResourceTypes = Object.entries(resourceTypeFilters)
            .filter(([_, checked]) => checked)
            .map(([id, _]) => parseInt(id));

          const { data: resources } = await supabase.rpc(
            'search_resources_normalized',
            {
              search_query: effectiveQuery,
              p_class_id: effectiveClassId ?? null,
              p_subject_id:
                subjectFilter !== 'all' ? parseInt(subjectFilter) : null,
              p_chapter_id:
                chapterFilter !== 'all' ? parseInt(chapterFilter) : null,
              p_type_ids:
                selectedResourceTypes.length > 0
                  ? selectedResourceTypes
                  : null,
              p_with_correction: withCorrectionOnly ? true : null,
            },
          );

          // Also search OCR content (only if enabled and class is selected)
          let ocrResults: any[] = [];
          if (searchInOcrContent && effectiveClassId && !isBookOnlyMode) {
            const { data: ocrData } = await supabase.rpc('search_pdf_content', {
              search_query: effectiveQuery,
              user_class_id: effectiveClassId
            });
            ocrResults = ocrData || [];
          }

          // Merge results
          const resourcesMap = new Map<number, any>();
          
          // Add title/description matches
          if (resources) {
            const normQuery = normalizeText(effectiveQuery);
            (resources as any[]).forEach((r: any) => {
              if (!matchesBookFilter(r.book)) return;
              const titleMatch = normalizeText(r.title || '').includes(normQuery);
              const descMatch = normalizeText(r.description || '').includes(normQuery);
              const bookMatchOnly = !titleMatch && !descMatch && r.book && normalizeText(r.book).includes(normQuery);
              resourcesMap.set(r.id, {
                id: r.id,
                type: 'resource' as const,
                title: r.title,
                description: r.description,
                matchType: titleMatch ? 'title' : descMatch ? 'description' : bookMatchOnly ? 'book' : 'description',
                chapterId: r.chapter_id,
                resourceType: r.resource_type,
                hasCorrection: r.with_correction,
                subjectName: r.subject_name,
                schoolName: r.school_name,
                teacherName: r.teacher_name,
                book: r.book,
              });
            });
          }

          // Add or merge OCR matches
          ocrResults.forEach((ocr: any) => {
            if (!matchesBookFilter(ocr.book)) return;
            // Apply additional filters to OCR results
            const passesFilters = 
              (subjectFilter === 'all' || ocr.subject_id === parseInt(subjectFilter)) &&
              (chapterFilter === 'all' || ocr.chapter_id === parseInt(chapterFilter)) &&
              (selectedResourceTypes.length === 0 || selectedResourceTypes.includes(ocr.type_id)) &&
              (!withCorrectionOnly || ocr.with_correction);

            if (!passesFilters) return;

            if (resourcesMap.has(ocr.id)) {
              // Already found via title/description, add OCR snippet
              const existing = resourcesMap.get(ocr.id);
              existing.matchSnippet = ocr.match_snippet;
              if (ocr.book && !existing.book) existing.book = ocr.book;
            } else {
              // New match from OCR content only
              resourcesMap.set(ocr.id, {
                id: ocr.id,
                type: 'resource' as const,
                title: ocr.title,
                description: ocr.description,
                matchType: 'content',
                matchSnippet: ocr.match_snippet,
                chapterId: ocr.chapter_id,
                subjectName: ocr.subjects?.name,
                book: ocr.book,
              });
            }
          });

          searchResults.push(...Array.from(resourcesMap.values()).slice(0, 15));
        }

        // Search questions
        if (filter === 'all' || filter === 'questions') {
          const { data: questions } = await supabase.rpc(
            'search_questions_normalized',
            {
              search_query: effectiveQuery,
              p_class_id: effectiveClassId ?? null,
              p_subject_id:
                subjectFilter !== 'all' ? parseInt(subjectFilter) : null,
              p_chapter_id:
                chapterFilter !== 'all' ? parseInt(chapterFilter) : null,
            },
          );

          // Also search Question OCR content (only if enabled and class is selected)
          let questionOcrResults: any[] = [];
          if (searchInQuestionOcrContent && effectiveClassId && !isBookOnlyMode) {
            const { data: questionOcrData } = await supabase.rpc('search_question_content', {
              search_query: effectiveQuery,
              user_class_id: effectiveClassId
            });
            questionOcrResults = questionOcrData || [];
          }

          // Merge question results
          const questionsMap = new Map<number, any>();

          if (questions) {
            const normQuery = normalizeText(effectiveQuery);
            (questions as any[]).slice(0, 10).forEach((q: any) => {
              if (!matchesBookFilter(q.book)) return;
              const dataMatch = normalizeText(q.data || '').includes(normQuery);
              const bookMatchOnly = !dataMatch && q.book && normalizeText(q.book).includes(normQuery);
              questionsMap.set(q.id, {
                id: q.id,
                type: 'question' as const,
                title: q.data.substring(0, 100),
                matchType: bookMatchOnly ? 'book' : 'title',
                chapterId: q.chapter_id,
                subjectName: q.subject_name,
                book: q.book,
              });
            });
          }

          // Add or merge Question OCR matches
          questionOcrResults.forEach((ocr: any) => {
            if (!matchesBookFilter(ocr.book)) return;
            // Apply additional filters to OCR results
            const passesFilters = 
              (subjectFilter === 'all' || ocr.subject_id === parseInt(subjectFilter)) &&
              (chapterFilter === 'all' || ocr.chapter_id === parseInt(chapterFilter));

            if (!passesFilters) return;

            if (questionsMap.has(ocr.id)) {
              // Already found via title, add OCR snippet
              const existing = questionsMap.get(ocr.id);
              existing.matchSnippet = ocr.match_snippet;
              existing.matchType = 'content';
              if (ocr.book && !existing.book) existing.book = ocr.book;
            } else {
              // New match from OCR content only
              questionsMap.set(ocr.id, {
                id: ocr.id,
                type: 'question' as const,
                title: ocr.data.substring(0, 100),
                matchType: 'content',
                matchSnippet: ocr.match_snippet,
                chapterId: ocr.chapter_id,
                book: ocr.book,
              });
            }
          });

          searchResults.push(...Array.from(questionsMap.values()).slice(0, 15));
        }

        // Search answers with class filtering through questions -> chapters -> subjects
        if ((filter === 'all' || filter === 'answers') && !normBook) {
          const { data: answers } = await supabase.rpc(
            'search_answers_normalized',
            {
              search_query: effectiveQuery,
              p_class_id: effectiveClassId ?? null,
            },
          );

          if (answers) {
            searchResults.push(...(answers as any[]).slice(0, 10).map((a: any) => ({
              id: a.id,
              type: 'answer' as const,
              title: a.data.substring(0, 100),
              questionId: a.question_id,
              subjectName: a.subject_name,
            })));
          }
        }

        setResults(searchResults);

        // Smart-match re-ranking: ask AI for semantic equivalents in titles
        if (query.length >= 3 && searchResults.length > 0) {
          try {
            const candidates = searchResults.slice(0, 30).map((r) => r.title);
            const { data: smart } = await supabase.functions.invoke(
              'smart-match',
              { body: { query, candidates, context: 'generic' } },
            );
            const equivIndexes: number[] = (smart?.matches || [])
              .filter((m: any) => m.equivalent)
              .map((m: any) => m.index);
            if (equivIndexes.length > 0) {
              setResults((prev) => {
                const flagged = prev.map((r, i) =>
                  equivIndexes.includes(i) ? { ...r, smartMatch: true } : r,
                );
                // Promote AI-confirmed matches to the top
                return [
                  ...flagged.filter((r) => r.smartMatch),
                  ...flagged.filter((r) => !r.smartMatch),
                ];
              });
            }
          } catch (err) {
            console.warn('smart-match unavailable:', err);
          }
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [query, bookFilter, filter, subjectFilter, chapterFilter, resourceTypeFilters, withCorrectionOnly, searchInOcrContent, searchInQuestionOcrContent, effectiveClassId]);

  const handleResultClick = (result: SearchResult) => {
    if (publicMode) {
      // In public mode, redirect to login first
      const targetPath = result.type === 'chapter' 
        ? `/chapter/${result.id}`
        : result.type === 'resource'
        ? `/resource/${result.id}`
        : result.type === 'question'
        ? `/question/${result.id}`
        : result.questionId
        ? `/question/${result.questionId}`
        : '/';
      navigate(`/login?redirect=${encodeURIComponent(targetPath)}`);
    } else {
      if (result.type === 'chapter') {
        navigate(`/chapter/${result.id}`);
      } else if (result.type === 'resource') {
        navigate(`/resource/${result.id}`);
      } else if (result.type === 'question') {
        navigate(`/question/${result.id}`);
      } else if (result.type === 'answer' && result.questionId) {
        navigate(`/question/${result.questionId}`);
      }
    }
    onClose();
  };

  const highlightKeyword = (text: string, keyword: string): React.ReactNode => {
    if (!keyword || keyword.length < 2) return text;
    
    try {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedKeyword})`, 'gi');
      const parts = text.split(regex);
      
      return parts.map((part, i) => 
        regex.test(part) ? 
          <mark key={i} className="bg-yellow-300 dark:bg-yellow-600/70 px-0.5 rounded">{part}</mark> 
          : part
      );
    } catch (error) {
      return text;
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'chapter': return <BookOpen className="w-4 h-4" />;
      case 'resource': return <FileText className="w-4 h-4" />;
      case 'question': return <HelpCircle className="w-4 h-4" />;
      case 'answer': return <MessageSquare className="w-4 h-4" />;
      default: return <Search className="w-4 h-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-4 sm:p-6 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Search className="w-4 h-4 sm:w-5 sm:h-5" />
            {t('globalSearch')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('searchPlaceholder')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4 overflow-hidden">
          {/* Class selector - optional in both modes */}
          <div>
            <Label className="text-xs mb-1 block">{t('selectClass')} ({t('optional')})</Label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t('allClasses')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allClasses')}</SelectItem>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id.toString()}>
                    {cls.name}{!publicMode && userClassId === cls.id ? ` (${t('myClass')})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="pl-10 text-sm"
              autoFocus
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => setFilter('all')}
              className="text-xs sm:text-sm"
            >
              {t('all')}
            </Button>
            <Button
              size="sm"
              variant={filter === 'chapters' ? 'default' : 'outline'}
              onClick={() => setFilter('chapters')}
              className="text-xs sm:text-sm"
            >
              {t('chapter')}s
            </Button>
            <Button
              size="sm"
              variant={filter === 'resources' ? 'default' : 'outline'}
              onClick={() => setFilter('resources')}
              className="text-xs sm:text-sm"
            >
              {t('resources')}
            </Button>
            <Button
              size="sm"
              variant={filter === 'questions' ? 'default' : 'outline'}
              onClick={() => setFilter('questions')}
              className="text-xs sm:text-sm"
            >
              {t('questions')}
            </Button>
            <Button
              size="sm"
              variant={filter === 'answers' ? 'default' : 'outline'}
              onClick={() => setFilter('answers')}
              className="text-xs sm:text-sm"
            >
              {t('answers')}
            </Button>
          </div>

          {/* Additional Filters */}
          <div className="space-y-2 sm:space-y-3 p-2 sm:p-3 border rounded-lg bg-muted/20 overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <div>
                <Label className="text-xs">{t('selectSubject')}</Label>
                <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t('allSubjects')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('allSubjects')}</SelectItem>
                    {subjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id.toString()}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">{t('chapter')}</Label>
                <Select 
                  value={chapterFilter} 
                  onValueChange={setChapterFilter}
                  disabled={subjectFilter === 'all'}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={subjectFilter === 'all' ? t('selectSubjectFirst') : t('allChapters')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('allChapters')}</SelectItem>
                    {chapters.map((chapter) => (
                      <SelectItem key={chapter.id} value={chapter.id.toString()}>
                        {chapter.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1 block">📘 {t('book') || 'Book'} ({t('optional')})</Label>
              <BookAutocomplete
                value={bookFilter}
                onChange={setBookFilter}
                source={filter === 'questions' ? 'question' : 'resource'}
                placeholder="📘 Filter by book name…"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">{t('resourceTypes')}</Label>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {resourceTypes.map((type) => (
                  <div key={type.id} className="flex items-center space-x-1.5">
                    <Checkbox
                      id={`type-${type.id}`}
                      checked={resourceTypeFilters[type.id] || false}
                      onCheckedChange={(checked) => 
                        setResourceTypeFilters(prev => ({ ...prev, [type.id]: !!checked }))
                      }
                    />
                    <label htmlFor={`type-${type.id}`} className="text-xs cursor-pointer truncate max-w-[100px]">
                      {type.type}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="withCorrection"
                  checked={withCorrectionOnly}
                  onCheckedChange={(checked) => setWithCorrectionOnly(!!checked)}
                />
                <label htmlFor="withCorrection" className="text-xs cursor-pointer">
                  {t('withCorrectionOnly')}
                </label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="searchInOcr"
                  checked={searchInOcrContent}
                  onCheckedChange={(checked) => setSearchInOcrContent(!!checked)}
                />
                <label htmlFor="searchInOcr" className="text-xs cursor-pointer">
                  {t('searchInPdfImageDocuments')}
                </label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="searchInQuestionOcr"
                  checked={searchInQuestionOcrContent}
                  onCheckedChange={(checked) => setSearchInQuestionOcrContent(!!checked)}
                />
                <label htmlFor="searchInQuestionOcr" className="text-xs cursor-pointer">
                  {t('searchInQuestionDocuments')}
                </label>
              </div>
            </div>
          </div>

          <ScrollArea className="h-[300px] sm:h-[400px]">
            {loading ? (
              <div className="text-center py-8 text-sm text-muted-foreground">{t('searching')}</div>
            ) : results.length === 0 && query.length >= 2 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">{t('noResults')}</div>
            ) : (
              <div className="space-y-2">
                {results.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleResultClick(result)}
                    className="w-full p-3 sm:p-4 text-left rounded-lg border-2 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all"
                  >
                    <div className="flex items-start gap-2 sm:gap-3 overflow-hidden">
                      <div className="mt-1 flex-shrink-0">
                        <div className="w-4 h-4 sm:w-5 sm:h-5">
                          {getIcon(result.type)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 py-0.5">
                            {result.type}
                          </Badge>
                          {result.matchType && (
                            <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0.5">
                              {result.matchType === 'title' ? 'In Title' : 
                               result.matchType === 'description' ? 'In Description' : 
                               result.matchType === 'book' ? 'In Book' :
                               'In Content'}
                            </Badge>
                          )}
                          {result.subjectName && (
                            <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0.5 max-w-[120px] truncate">
                              {result.subjectName}
                            </Badge>
                          )}
                          {result.resourceType && (
                            <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0.5 max-w-[100px] truncate">
                              {result.resourceType}
                            </Badge>
                          )}
                          {result.hasCorrection && (
                            <Badge className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-green-100 text-green-700">
                              {t('withCorrection')}
                            </Badge>
                          )}
                          {result.smartMatch && (
                            <Badge className="text-[10px] sm:text-xs px-1.5 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200">
                              ✨ Smart match
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium text-sm sm:text-base truncate">
                          {highlightKeyword(result.title, query)}
                        </p>
                        {(result.schoolName || result.teacherName) && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            {result.schoolName && <span>🏫 {result.schoolName}</span>}
                            {result.teacherName && <span>👨‍🏫 {result.teacherName}</span>}
                          </div>
                        )}
                        {result.book && (
                          <div className="mt-1">
                            <BookBadge book={result.book} />
                          </div>
                        )}
                        {result.description && (
                          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mt-1 break-words">
                            {highlightKeyword(result.description, query)}
                          </p>
                        )}
                        {result.matchSnippet && (
                          <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-words italic border-l-2 border-yellow-300 dark:border-yellow-600 pl-2">
                            {highlightKeyword(result.matchSnippet, query)}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};
