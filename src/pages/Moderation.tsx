import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Header } from '@/components/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, BookOpen, MessageCircle, Brain, FileText, ExternalLink, GraduationCap } from 'lucide-react';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Navigate, Link } from 'react-router-dom';

type ContentType = 'questions' | 'answers' | 'resources' | 'memorizations' | 'teachers' | 'users';

interface UnverifiedItem {
  id: number | string;
  type: ContentType;
  title?: string;
  data?: string;
  description?: string;
  created_at: string;
  contributor_name?: string;
  subject_name?: string;
  chapter_name?: string;
  question_id?: number; // For answers
  full_name?: string; // For teachers and users
  teacher_documents?: string[]; // For teachers
  user_id?: string; // For teachers and users
  tutorial_completed?: boolean; // For users
  tutorial_step?: number; // For users
  user_type?: string; // For users
}

export default function Moderation() {
  const { isModerator, isAdmin, loading: roleLoading } = useUserRole();
  const [items, setItems] = useState<UnverifiedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ContentType>('questions');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedChapter, setSelectedChapter] = useState<string>('all');
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);

  useEffect(() => {
    if (!roleLoading && (isModerator || isAdmin)) {
      fetchClasses();
      fetchUnverifiedItems(activeTab);
    }
  }, [activeTab, selectedClass, selectedSubject, selectedChapter, isModerator, isAdmin, roleLoading]);

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

  const fetchUnverifiedItems = async (type: ContentType) => {
    setLoading(true);
    try {
      const classFilter = selectedClass !== 'all' ? parseInt(selectedClass) : null;
      const subjectFilter = selectedSubject !== 'all' ? parseInt(selectedSubject) : null;
      const chapterFilter = selectedChapter !== 'all' ? parseInt(selectedChapter) : null;
      
      let items: UnverifiedItem[] = [];

      switch (type) {
        case 'questions':
          let questionsQuery = supabase
            .from('questions')
            .select(`
              id,
              data,
              created_at,
              verified,
              contributors,
              chapter_id,
              chapters(name, class_id, subject_id, subjects(name))
            `)
            .eq('deleted', false)
            .eq('verified', false)
            .order('created_at', { ascending: false });

          if (classFilter) {
            questionsQuery = questionsQuery.eq('chapters.class_id', classFilter);
          }
          if (subjectFilter) {
            questionsQuery = questionsQuery.eq('chapters.subject_id', subjectFilter);
          }
          if (chapterFilter) {
            questionsQuery = questionsQuery.eq('chapter_id', chapterFilter);
          }

          const { data: questions } = await questionsQuery;

          items = (questions || []).map(q => ({
            id: q.id,
            type: 'questions' as ContentType,
            data: q.data,
            created_at: q.created_at,
            chapter_name: (q.chapters as any)?.name,
            subject_name: (q.chapters as any)?.subjects?.name,
          }));
          break;

        case 'answers':
          let answersQuery = supabase
            .from('answers')
            .select(`
              id,
              data,
              created_at,
              verified,
              contributors,
              question_id,
              questions(chapter_id, data, chapters(name, class_id, subject_id, subjects(name)))
            `)
            .eq('deleted', false)
            .eq('verified', false)
            .order('created_at', { ascending: false });

          if (classFilter) {
            answersQuery = answersQuery.eq('questions.chapters.class_id', classFilter);
          }
          if (subjectFilter) {
            answersQuery = answersQuery.eq('questions.chapters.subject_id', subjectFilter);
          }
          if (chapterFilter) {
            answersQuery = answersQuery.eq('questions.chapter_id', chapterFilter);
          }

          const { data: answers } = await answersQuery;

          items = (answers || []).map(a => ({
            id: a.id,
            type: 'answers' as ContentType,
            data: a.data,
            created_at: a.created_at,
            chapter_name: (a.questions as any)?.chapters?.name,
            subject_name: (a.questions as any)?.chapters?.subjects?.name,
            question_id: a.question_id,
          }));
          break;

        case 'resources':
          let resourcesQuery = supabase
            .from('resources')
            .select(`
              id,
              title,
              description,
              created_at,
              verified,
              published_by,
              chapter_id,
              subject_id,
              chapters(name, class_id, subject_id, subjects(name))
            `)
            .eq('deleted', false)
            .eq('verified', false)
            .order('created_at', { ascending: false });

          if (classFilter) {
            resourcesQuery = resourcesQuery.eq('chapters.class_id', classFilter);
          }
          if (subjectFilter) {
            resourcesQuery = resourcesQuery.eq('subject_id', subjectFilter);
          }
          if (chapterFilter) {
            resourcesQuery = resourcesQuery.eq('chapter_id', chapterFilter);
          }

          const { data: resources } = await resourcesQuery;

          items = (resources || []).map(r => ({
            id: r.id,
            type: 'resources' as ContentType,
            title: r.title,
            description: r.description,
            created_at: r.created_at,
            chapter_name: (r.chapters as any)?.name,
            subject_name: (r.chapters as any)?.subjects?.name,
          }));
          break;

        case 'memorizations':
          const { data: memorizations } = await supabase
            .from('memorizations')
            .select(`
              id,
              title,
              description,
              created_at,
              verified,
              creator_id,
              subjects(name),
              chapters(name)
            `)
            .eq('deleted', false)
            .eq('verified', false)
            .order('created_at', { ascending: false });

          items = (memorizations || []).map(m => ({
            id: m.id,
            type: 'memorizations' as ContentType,
            title: m.title,
            description: m.description,
            created_at: m.created_at,
            subject_name: (m.subjects as any)?.name,
            chapter_name: (m.chapters as any)?.name,
          }));
          break;

        case 'teachers':
          const { data: teachers } = await supabase
            .from('profiles')
            .select(`
              user_id,
              full_name,
              teacher_documents,
              created_at,
              teacher_verification_status
            `)
            .eq('user_type', 'teacher')
            .eq('teacher_verified', false)
            .neq('teacher_verification_status', 'rejected')
            .order('created_at', { ascending: false });

          items = (teachers || []).map(t => ({
            id: t.user_id as any, // Will be used as user_id for approval
            type: 'teachers' as ContentType,
            full_name: t.full_name,
            teacher_documents: t.teacher_documents,
            created_at: t.created_at,
            user_id: t.user_id,
          }));
          break;

        case 'users':
          const { data: users } = await supabase
            .from('profiles')
            .select(`
              user_id,
              full_name,
              created_at,
              tutorial_completed,
              tutorial_step,
              user_type
            `)
            .order('created_at', { ascending: false })
            .limit(100);

          items = (users || []).map(u => ({
            id: u.user_id as any,
            type: 'users' as ContentType,
            full_name: u.full_name,
            created_at: u.created_at,
            user_id: u.user_id,
            tutorial_completed: u.tutorial_completed,
            tutorial_step: u.tutorial_step,
            user_type: u.user_type,
          }));
          break;
      }

      setItems(items);
    } catch (error) {
      console.error('Error fetching unverified items:', error);
      toast.error('Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (id: number | string, type: ContentType, approve: boolean) => {
    try {
      if (type === 'teachers') {
        // Handle teacher verification differently - id is user_id (string)
        const { error } = await supabase
          .from('profiles')
          .update({ 
            teacher_verified: approve,
            teacher_verification_status: approve ? 'approved' : 'rejected'
          })
          .eq('user_id', id as string);

        if (error) throw error;
        toast.success(approve ? 'Teacher verified' : 'Teacher verification rejected');
      } else {
        if (approve) {
          // Approve: set verified to true
          const { error } = await supabase
            .from(type as 'questions' | 'answers' | 'resources' | 'memorizations')
            .update({ verified: true })
            .eq('id', id as number);

          if (error) throw error;
          toast.success('Item approved');
        } else {
          // Reject: soft delete
          const { error } = await supabase
            .from(type as 'questions' | 'answers' | 'resources' | 'memorizations')
            .update({ deleted: true })
            .eq('id', id as number);

          if (error) throw error;
          toast.success('Item deleted');
        }
      }

      fetchUnverifiedItems(activeTab);
    } catch (error) {
      console.error('Error updating verification:', error);
      toast.error('Failed to update item');
    }
  };

  const getViewLink = (item: UnverifiedItem) => {
    switch (item.type) {
      case 'questions':
        return `/question/${item.id}`;
      case 'answers':
        return `/question/${item.question_id}`;
      case 'resources':
        return `/resource/${item.id}`;
      case 'memorizations':
        return `/`; // Memorizations are viewed in modals, so go to home
      default:
        return '/';
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
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Content Moderation</h1>
              <p className="text-muted-foreground">Review and approve pending content</p>
            </div>
            
            <div className="flex gap-2">
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Classes" />
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
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="All Subjects" />
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
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="All Chapters" />
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
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ContentType)}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="questions" className="gap-2">
              <MessageCircle className="w-4 h-4" />
              Questions
            </TabsTrigger>
            <TabsTrigger value="answers" className="gap-2">
              <FileText className="w-4 h-4" />
              Answers
            </TabsTrigger>
            <TabsTrigger value="resources" className="gap-2">
              <BookOpen className="w-4 h-4" />
              Resources
            </TabsTrigger>
            <TabsTrigger value="memorizations" className="gap-2">
              <Brain className="w-4 h-4" />
              Memorizations
            </TabsTrigger>
            <TabsTrigger value="teachers" className="gap-2">
              <GraduationCap className="w-4 h-4" />
              Teachers
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <BookOpen className="w-4 h-4" />
              Users
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            {loading ? (
              <div className="text-center py-12">Loading...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No pending items to review
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => (
                  <Card key={item.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        {item.type === 'teachers' ? (
                          <>
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                              <GraduationCap className="w-5 h-5 text-primary" />
                              {item.full_name}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Teacher Verification Request
                            </p>
                            {item.teacher_documents && item.teacher_documents.length > 0 && (
                              <div className="space-y-1 mt-2">
                                <p className="text-sm font-medium">Uploaded Documents:</p>
                                {item.teacher_documents.map((doc, idx) => (
                                  <a
                                    key={idx}
                                    href={doc}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                                  >
                                    <FileText className="w-4 h-4" />
                                    Document {idx + 1}
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </>
                        ) : item.type === 'users' ? (
                          <>
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                              {item.full_name}
                            </h3>
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">
                                User Type: <span className="font-medium">{item.user_type || 'student'}</span>
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Tutorial Status: {item.tutorial_completed ? (
                                  <Badge className="ml-2 bg-green-500">Completed</Badge>
                                ) : (
                                  <Badge variant="outline" className="ml-2">
                                    Step {item.tutorial_step || 0} of 4
                                  </Badge>
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Joined: {new Date(item.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            {item.title && (
                              <h3 className="font-semibold text-lg">{item.title}</h3>
                            )}
                            {item.data && (
                              <p className="text-sm line-clamp-3">{item.data}</p>
                            )}
                            {item.description && (
                              <p className="text-sm text-muted-foreground">{item.description}</p>
                            )}
                          </>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {item.subject_name && (
                            <Badge variant="secondary">{item.subject_name}</Badge>
                          )}
                          {item.chapter_name && (
                            <Badge variant="outline">{item.chapter_name}</Badge>
                          )}
                          <span>
                            {new Date(item.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {item.type !== 'teachers' && item.type !== 'users' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            asChild
                          >
                            <Link to={getViewLink(item)} target="_blank">
                              <ExternalLink className="w-4 h-4" />
                              View
                            </Link>
                          </Button>
                        )}
                        {item.type !== 'users' && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              className="gap-2"
                              onClick={() => handleVerify(item.id, item.type, true)}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-2"
                              onClick={() => handleVerify(item.id, item.type, false)}
                            >
                              <XCircle className="w-4 h-4" />
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
