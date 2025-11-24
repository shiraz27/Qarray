import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { BarChart3, BookOpen, MessageCircle, Brain, FileText, CheckCircle2, Clock, Play, Loader2, Search } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';
import { Input } from '@/components/ui/input';

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
  data: string[];
  ocr_status: string | null;
  chapter_id: number | null;
  chapters?: { name: string };
  resource_types?: { type: string };
}

export default function Statistics() {
  const { isModerator, isAdmin, loading: roleLoading } = useUserRole();
  const [stats, setStats] = useState<Stats | null>(null);
  const [ocrStats, setOcrStats] = useState<OcrStats | null>(null);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedChapter, setSelectedChapter] = useState<string>('all');
  const [ocrFilter, setOcrFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const itemsPerPage = 20;

  useEffect(() => {
    if (!roleLoading && (isModerator || isAdmin)) {
      fetchClasses();
      fetchStats(selectedClass, selectedSubject, selectedChapter);
      fetchOcrStats(selectedClass, selectedSubject, selectedChapter);
      fetchResources(selectedClass, selectedSubject, selectedChapter);
    }
  }, [selectedClass, selectedSubject, selectedChapter, isModerator, isAdmin, roleLoading]);

  useEffect(() => {
    setCurrentPage(1);
  }, [ocrFilter, searchQuery]);

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

  const fetchResources = async (classId: string, subjectId: string, chapterId: string) => {
    setResourcesLoading(true);
    try {
      const classFilter = classId !== 'all' ? parseInt(classId) : null;
      const subjectFilter = subjectId !== 'all' ? parseInt(subjectId) : null;
      const chapterFilter = chapterId !== 'all' ? parseInt(chapterId) : null;

      let query = supabase
        .from('resources')
        .select('id, title, data, ocr_status, chapter_id, chapters(name), resource_types(type)')
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

  const handleProcessAllPending = async () => {
    setIsProcessingBatch(true);
    try {
      // Get all pending and failed resources
      const resourcesToProcess = resources.filter(r => r.ocr_status === 'pending' || r.ocr_status === 'failed');
      
      if (resourcesToProcess.length === 0) {
        toast.info('No resources to process');
        return;
      }

      toast.info(`Processing ${resourcesToProcess.length} resources...`);
      
      // Process each resource via edge function
      let successCount = 0;
      let failCount = 0;
      
      for (const resource of resourcesToProcess) {
        try {
          const { data, error } = await supabase.functions.invoke('process-ocr', {
            body: {
              resourceId: resource.id,
              mediaUrls: resource.data
            }
          });

          if (error) throw error;
          
          if (data?.success) {
            successCount++;
            console.log(`Resource ${resource.id}: ${data.message}`);
          } else {
            failCount++;
            console.error(`Resource ${resource.id} failed:`, data?.error);
          }
        } catch (error) {
          failCount++;
          console.error(`Error processing resource ${resource.id}:`, error);
        }
      }
      
      toast.success(`Processed ${successCount} resources successfully${failCount > 0 ? `, ${failCount} failed` : ''}!`);
      fetchOcrStats(selectedClass, selectedSubject, selectedChapter);
      fetchResources(selectedClass, selectedSubject, selectedChapter);
    } catch (error) {
      console.error('Error processing batch:', error);
      toast.error('Failed to process resources');
    } finally {
      setIsProcessingBatch(false);
    }
  };

  const handleProcessSingle = async (resourceId: number, mediaUrls: string[]) => {
    setProcessingId(resourceId);
    try {
      const { data, error } = await supabase.functions.invoke('process-ocr', {
        body: {
          resourceId,
          mediaUrls
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(data.message || 'Resource processed!');
      } else {
        throw new Error(data?.error || 'Processing failed');
      }
      
      fetchOcrStats(selectedClass, selectedSubject, selectedChapter);
      fetchResources(selectedClass, selectedSubject, selectedChapter);
    } catch (error) {
      console.error('Error processing resource:', error);
      toast.error('Failed to process resource');
    } finally {
      setProcessingId(null);
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
    const matchesSearch = r.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalPages = Math.ceil(filteredResources.length / itemsPerPage);
  const paginatedResources = filteredResources.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const ocrChartData = ocrStats ? [
    { name: 'Completed', value: ocrStats.completed, color: 'hsl(var(--chart-2))' },
    { name: 'Pending', value: ocrStats.pending, color: 'hsl(var(--chart-3))' },
    { name: 'Failed', value: ocrStats.failed, color: 'hsl(var(--chart-4))' },
    { name: 'Not Applicable', value: ocrStats.not_applicable, color: 'hsl(var(--muted))' },
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

            {/* OCR Processing Stats */}
            {ocrStats && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>OCR Processing Status</CardTitle>
                      <CardDescription>Text extraction from PDFs and images</CardDescription>
                    </div>
                    {(ocrStats.pending > 0 || ocrStats.failed > 0) && (
                      <Button 
                        onClick={handleProcessAllPending} 
                        disabled={isProcessingBatch}
                        size="sm"
                      >
                        {isProcessingBatch && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Process All ({ocrStats.pending + ocrStats.failed})
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
            )}

            {/* Resources Table */}
            <Card>
              <CardHeader>
                <CardTitle>Resources & OCR Status</CardTitle>
                <CardDescription>Detailed list of all resources with their OCR processing status</CardDescription>
                <div className="flex gap-2 mt-4">
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
              </CardHeader>
              <CardContent>
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
                            <TableHead className="w-[80px]">ID</TableHead>
                            <TableHead>Title</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Chapter</TableHead>
                            <TableHead>OCR Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedResources.map((resource) => {
                            const isPdfOrImage = resource.data.some(url => 
                              url.toLowerCase().includes('.pdf') || 
                              url.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)/)
                            );
                            const canProcess = (resource.ocr_status === 'pending' || resource.ocr_status === 'failed') && isPdfOrImage;
                            
                            return (
                              <TableRow key={resource.id}>
                                <TableCell className="font-medium">{resource.id}</TableCell>
                                <TableCell>
                                  <div className="max-w-[300px] truncate">{resource.title}</div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{resource.resource_types?.type || 'Unknown'}</Badge>
                                </TableCell>
                                <TableCell>
                                  {resource.chapters?.name || 'N/A'}
                                </TableCell>
                                <TableCell>
                                  {getOcrStatusBadge(resource.ocr_status)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {canProcess && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleProcessSingle(resource.id, resource.data)}
                                      disabled={processingId === resource.id}
                                    >
                                      {processingId === resource.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Play className="h-4 w-4" />
                                      )}
                                    </Button>
                                  )}
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
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
