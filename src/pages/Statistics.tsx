import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { BarChart3, BookOpen, MessageCircle, Brain, FileText, CheckCircle2, Clock } from 'lucide-react';
import { Navigate } from 'react-router-dom';

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

export default function Statistics() {
  const { isModerator, isAdmin, loading: roleLoading } = useUserRole();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [classes, setClasses] = useState<any[]>([]);

  useEffect(() => {
    if (!roleLoading && (isModerator || isAdmin)) {
      fetchClasses();
      fetchStats(selectedClass);
    }
  }, [selectedClass, isModerator, isAdmin, roleLoading]);

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

  const fetchStats = async (classId: string) => {
    setLoading(true);
    try {
      const classFilter = classId !== 'all' ? parseInt(classId) : null;

      // Questions
      let questionsQuery = supabase
        .from('questions')
        .select('id, verified, chapters!inner(class_id)', { count: 'exact' })
        .eq('deleted', false);
      
      if (classFilter) {
        questionsQuery = questionsQuery.eq('chapters.class_id', classFilter);
      }

      const { count: totalQuestions } = await questionsQuery;
      const { count: verifiedQuestions } = await questionsQuery.eq('verified', true);

      // Answers
      let answersQuery = supabase
        .from('answers')
        .select('id, verified, questions!inner(chapters!inner(class_id))', { count: 'exact' })
        .eq('deleted', false);
      
      if (classFilter) {
        answersQuery = answersQuery.eq('questions.chapters.class_id', classFilter);
      }

      const { count: totalAnswers } = await answersQuery;
      const { count: verifiedAnswers } = await answersQuery.eq('verified', true);

      // Resources
      let resourcesQuery = supabase
        .from('resources')
        .select('id, verified, with_correction, devoir_type_id, chapters!inner(class_id)', { count: 'exact' })
        .eq('deleted', false);
      
      if (classFilter) {
        resourcesQuery = resourcesQuery.eq('chapters.class_id', classFilter);
      }

      const { count: totalResources } = await resourcesQuery;
      const { count: verifiedResources } = await resourcesQuery.eq('verified', true);
      const { count: resourcesWithCorrection } = await resourcesQuery.eq('with_correction', true);

      // Resources by devoir type
      const { data: resourcesData } = await supabase
        .from('resources')
        .select('devoir_type_id, devoir_types(devoir_type), chapters!inner(class_id)')
        .eq('deleted', false)
        .not('devoir_type_id', 'is', null);

      const devoirCounts: { [key: string]: number } = {};
      resourcesData?.forEach((r: any) => {
        if (classFilter && r.chapters?.class_id !== classFilter) return;
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
        .select('id, class_id', { count: 'exact' })
        .eq('deleted', false);
      
      if (classFilter) {
        memorizationsQuery = memorizationsQuery.eq('class_id', classFilter);
      }

      const { count: totalMemorizations } = await memorizationsQuery;

      setStats({
        total_questions: totalQuestions || 0,
        total_answers: totalAnswers || 0,
        total_resources: totalResources || 0,
        total_memorizations: totalMemorizations || 0,
        verified_questions: verifiedQuestions || 0,
        verified_answers: verifiedAnswers || 0,
        verified_resources: verifiedResources || 0,
        verified_memorizations: 0, // Verified column not yet added to memorizations
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

          <div className="w-64">
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger>
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
          </div>
        )}
      </main>
    </div>
  );
}
