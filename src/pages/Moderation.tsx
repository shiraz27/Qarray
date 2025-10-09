import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Header } from '@/components/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, BookOpen, MessageCircle, Brain, FileText } from 'lucide-react';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Navigate } from 'react-router-dom';

type ContentType = 'questions' | 'answers' | 'resources' | 'memorizations';

interface UnverifiedItem {
  id: number;
  type: ContentType;
  title?: string;
  data?: string;
  description?: string;
  created_at: string;
  contributor_name?: string;
  subject_name?: string;
  chapter_name?: string;
}

export default function Moderation() {
  const { isModerator, isAdmin, loading: roleLoading } = useUserRole();
  const [items, setItems] = useState<UnverifiedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ContentType>('questions');

  useEffect(() => {
    if (!roleLoading && (isModerator || isAdmin)) {
      fetchUnverifiedItems(activeTab);
    }
  }, [activeTab, isModerator, isAdmin, roleLoading]);

  const fetchUnverifiedItems = async (type: ContentType) => {
    setLoading(true);
    try {
      let query;
      let items: UnverifiedItem[] = [];

      switch (type) {
        case 'questions':
          const { data: questions } = await supabase
            .from('questions')
            .select(`
              id,
              data,
              created_at,
              verified,
              contributors,
              chapters(name, subjects(name))
            `)
            .eq('deleted', false)
            .eq('verified', false)
            .order('created_at', { ascending: false });

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
          const { data: answers } = await supabase
            .from('answers')
            .select(`
              id,
              data,
              created_at,
              verified,
              contributors,
              question_id,
              questions(data, chapters(name, subjects(name)))
            `)
            .eq('deleted', false)
            .eq('verified', false)
            .order('created_at', { ascending: false });

          items = (answers || []).map(a => ({
            id: a.id,
            type: 'answers' as ContentType,
            data: a.data,
            created_at: a.created_at,
            chapter_name: (a.questions as any)?.chapters?.name,
            subject_name: (a.questions as any)?.chapters?.subjects?.name,
          }));
          break;

        case 'resources':
          const { data: resources } = await supabase
            .from('resources')
            .select(`
              id,
              title,
              description,
              created_at,
              verified,
              published_by,
              chapters(name, subjects(name))
            `)
            .eq('deleted', false)
            .eq('verified', false)
            .order('created_at', { ascending: false });

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
      }

      setItems(items);
    } catch (error) {
      console.error('Error fetching unverified items:', error);
      toast.error('Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (id: number, type: ContentType, approve: boolean) => {
    try {
      const { error } = await supabase
        .from(type)
        .update({ verified: approve })
        .eq('id', id);

      if (error) throw error;

      toast.success(approve ? 'Item approved' : 'Item rejected');
      fetchUnverifiedItems(activeTab);
    } catch (error) {
      console.error('Error updating verification:', error);
      toast.error('Failed to update item');
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
          <h1 className="text-3xl font-bold mb-2">Content Moderation</h1>
          <p className="text-muted-foreground">Review and approve pending content</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ContentType)}>
          <TabsList className="grid w-full grid-cols-4">
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
                        {item.title && (
                          <h3 className="font-semibold text-lg">{item.title}</h3>
                        )}
                        {item.data && (
                          <p className="text-sm line-clamp-3">{item.data}</p>
                        )}
                        {item.description && (
                          <p className="text-sm text-muted-foreground">{item.description}</p>
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
