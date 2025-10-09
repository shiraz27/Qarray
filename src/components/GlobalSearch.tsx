import React, { useState, useEffect } from 'react';
import { Search, X, FileText, HelpCircle, MessageSquare, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
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

interface SearchResult {
  id: number;
  type: 'chapter' | 'resource' | 'question' | 'answer';
  title: string;
  description?: string;
  chapterId?: number;
  questionId?: number;
  subjectName?: string;
  resourceType?: string;
  hasCorrection?: boolean;
}

export const GlobalSearch: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'chapters' | 'resources' | 'questions' | 'answers'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [chapterFilter, setChapterFilter] = useState<string>('all');
  const [resourceTypeFilters, setResourceTypeFilters] = useState<Record<number, boolean>>({});
  const [withCorrectionOnly, setWithCorrectionOnly] = useState(false);
  const [subjects, setSubjects] = useState<Array<{ id: number; name: string }>>([]);
  const [chapters, setChapters] = useState<Array<{ id: number; name: string }>>([]);
  const [resourceTypes, setResourceTypes] = useState<Array<{ id: number; type: string }>>([]);
  const [userClassId, setUserClassId] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      fetchUserClass();
    }
  }, [open]);

  useEffect(() => {
    if (userClassId) {
      fetchSubjects();
      fetchResourceTypes();
    }
  }, [userClassId]);

  useEffect(() => {
    if (subjectFilter !== 'all') {
      fetchChapters(parseInt(subjectFilter));
    } else {
      setChapters([]);
      setChapterFilter('all');
    }
  }, [subjectFilter]);

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
    const { data: subjectsData } = await supabase
      .from('subjects')
      .select('id, name')
      .eq('class_id', userClassId)
      .eq('deleted', false)
      .order('name');

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
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setLoading(true);
      try {
        const searchResults: SearchResult[] = [];

        // Search chapters
        if (filter === 'all' || filter === 'chapters') {
          let chaptersQuery = supabase
            .from('chapters')
            .select('id, name, subject_id, subjects(name, class_id)')
            .ilike('name', `%${query}%`)
            .eq('deleted', false);

          if (subjectFilter !== 'all') {
            chaptersQuery = chaptersQuery.eq('subject_id', parseInt(subjectFilter));
          }

          if (chapterFilter !== 'all') {
            chaptersQuery = chaptersQuery.eq('id', parseInt(chapterFilter));
          }

          // Filter by user's class
          if (userClassId) {
            chaptersQuery = chaptersQuery.eq('subjects.class_id', userClassId);
          }

          const { data: chapters } = await chaptersQuery.limit(5);

          if (chapters) {
            searchResults.push(...chapters.map((ch: any) => ({
              id: ch.id,
              type: 'chapter' as const,
              title: ch.name,
              subjectName: ch.subjects?.name,
            })));
          }
        }

        // Search resources
        if (filter === 'all' || filter === 'resources') {
          let resourcesQuery = supabase
            .from('resources')
            .select('id, title, description, chapter_id, type_id, with_correction, data, resource_types(type), chapters(subject_id, subjects(name, class_id))')
            .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
            .eq('deleted', false);

          if (subjectFilter !== 'all') {
            resourcesQuery = resourcesQuery.eq('chapters.subject_id', parseInt(subjectFilter));
          }

          if (chapterFilter !== 'all') {
            resourcesQuery = resourcesQuery.eq('chapter_id', parseInt(chapterFilter));
          }

          // Filter by user's class
          if (userClassId) {
            resourcesQuery = resourcesQuery.eq('chapters.subjects.class_id', userClassId);
          }

          // Filter by resource types
          const selectedResourceTypes = Object.entries(resourceTypeFilters)
            .filter(([_, checked]) => checked)
            .map(([id, _]) => parseInt(id));

          if (selectedResourceTypes.length > 0) {
            resourcesQuery = resourcesQuery.in('type_id', selectedResourceTypes);
          }

          if (withCorrectionOnly) {
            resourcesQuery = resourcesQuery.eq('with_correction', true);
          }

          const { data: resources } = await resourcesQuery.limit(5);

          if (resources) {
            searchResults.push(...resources.map((r: any) => ({
              id: r.id,
              type: 'resource' as const,
              title: r.title,
              description: r.description,
              chapterId: r.chapter_id,
              resourceType: r.resource_types?.type,
              hasCorrection: r.with_correction,
              subjectName: r.chapters?.subjects?.name,
            })));
          }
        }

        // Search questions
        if (filter === 'all' || filter === 'questions') {
          let questionsQuery = supabase
            .from('questions')
            .select('id, data, chapter_id, chapters(subject_id, subjects(name, class_id))')
            .ilike('data', `%${query}%`)
            .eq('deleted', false);

          if (subjectFilter !== 'all') {
            questionsQuery = questionsQuery.eq('chapters.subject_id', parseInt(subjectFilter));
          }

          if (chapterFilter !== 'all') {
            questionsQuery = questionsQuery.eq('chapter_id', parseInt(chapterFilter));
          }

          // Filter by user's class
          if (userClassId) {
            questionsQuery = questionsQuery.eq('chapters.subjects.class_id', userClassId);
          }

          const { data: questions } = await questionsQuery.limit(5);

          if (questions) {
            searchResults.push(...questions.map((q: any) => ({
              id: q.id,
              type: 'question' as const,
              title: q.data.substring(0, 100),
              chapterId: q.chapter_id,
              subjectName: q.chapters?.subjects?.name,
            })));
          }
        }

        // Search answers
        if (filter === 'all' || filter === 'answers') {
          const { data: answers } = await supabase
            .from('answers')
            .select('id, data, question_id')
            .ilike('data', `%${query}%`)
            .eq('deleted', false)
            .limit(5);

          if (answers) {
            searchResults.push(...answers.map(a => ({
              id: a.id,
              type: 'answer' as const,
              title: a.data.substring(0, 100),
              questionId: a.question_id,
            })));
          }
        }

        setResults(searchResults);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [query, filter, subjectFilter, chapterFilter, resourceTypeFilters, withCorrectionOnly, userClassId]);

  const handleResultClick = (result: SearchResult) => {
    if (result.type === 'chapter') {
      navigate(`/chapter/${result.id}`);
    } else if (result.type === 'resource') {
      navigate(`/resource/${result.id}`);
    } else if (result.type === 'question') {
      navigate(`/question/${result.id}`);
    } else if (result.type === 'answer' && result.questionId) {
      navigate(`/question/${result.questionId}`);
    }
    onClose();
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Global Search
          </DialogTitle>
          <DialogDescription className="sr-only">
            Search across chapters, resources, questions, and answers
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chapters, resources, questions, answers..."
              className="pl-10"
              autoFocus
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => setFilter('all')}
            >
              All
            </Button>
            <Button
              size="sm"
              variant={filter === 'chapters' ? 'default' : 'outline'}
              onClick={() => setFilter('chapters')}
            >
              Chapters
            </Button>
            <Button
              size="sm"
              variant={filter === 'resources' ? 'default' : 'outline'}
              onClick={() => setFilter('resources')}
            >
              Resources
            </Button>
            <Button
              size="sm"
              variant={filter === 'questions' ? 'default' : 'outline'}
              onClick={() => setFilter('questions')}
            >
              Questions
            </Button>
            <Button
              size="sm"
              variant={filter === 'answers' ? 'default' : 'outline'}
              onClick={() => setFilter('answers')}
            >
              Answers
            </Button>
          </div>

          {/* Additional Filters */}
          <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Subject</Label>
                <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All subjects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All subjects</SelectItem>
                    {subjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id.toString()}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Chapter</Label>
                <Select 
                  value={chapterFilter} 
                  onValueChange={setChapterFilter}
                  disabled={subjectFilter === 'all'}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={subjectFilter === 'all' ? 'Select subject first' : 'All chapters'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All chapters</SelectItem>
                    {chapters.map((chapter) => (
                      <SelectItem key={chapter.id} value={chapter.id.toString()}>
                        {chapter.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Resource Types</Label>
              <div className="flex flex-wrap gap-3">
                {resourceTypes.map((type) => (
                  <div key={type.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`type-${type.id}`}
                      checked={resourceTypeFilters[type.id] || false}
                      onCheckedChange={(checked) => 
                        setResourceTypeFilters(prev => ({ ...prev, [type.id]: !!checked }))
                      }
                    />
                    <label htmlFor={`type-${type.id}`} className="text-xs cursor-pointer">
                      {type.type}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="withCorrection"
                checked={withCorrectionOnly}
                onCheckedChange={(checked) => setWithCorrectionOnly(!!checked)}
              />
              <label htmlFor="withCorrection" className="text-xs cursor-pointer">
                With correction only
              </label>
            </div>
          </div>

          <ScrollArea className="h-[400px]">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Searching...</div>
            ) : results.length === 0 && query.length >= 2 ? (
              <div className="text-center py-8 text-muted-foreground">No results found</div>
            ) : (
              <div className="space-y-2">
                {results.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleResultClick(result)}
                    className="w-full p-4 text-left rounded-lg border-2 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all"
                  >
                    <div className="flex items-start gap-3 overflow-hidden">
                      <div className="mt-1 flex-shrink-0">{getIcon(result.type)}</div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {result.type}
                          </Badge>
                          {result.subjectName && (
                            <Badge variant="outline" className="text-xs">
                              {result.subjectName}
                            </Badge>
                          )}
                          {result.resourceType && (
                            <Badge variant="outline" className="text-xs">
                              {result.resourceType}
                            </Badge>
                          )}
                          {result.hasCorrection && (
                            <Badge className="text-xs bg-green-100 text-green-700">
                              With correction
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium truncate">{result.title}</p>
                        {result.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1 break-words">
                            {result.description}
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
