import React, { useState, useEffect } from 'react';
import { Search, X, FileText, HelpCircle, MessageSquare, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SearchResult {
  id: number;
  type: 'chapter' | 'resource' | 'question' | 'answer';
  title: string;
  description?: string;
  chapterId?: number;
  questionId?: number;
}

export const GlobalSearch: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'chapters' | 'resources' | 'questions' | 'answers'>('all');
  const navigate = useNavigate();

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
          const { data: chapters } = await supabase
            .from('chapters')
            .select('id, name')
            .ilike('name', `%${query}%`)
            .eq('deleted', false)
            .limit(5);

          if (chapters) {
            searchResults.push(...chapters.map(ch => ({
              id: ch.id,
              type: 'chapter' as const,
              title: ch.name,
            })));
          }
        }

        // Search resources
        if (filter === 'all' || filter === 'resources') {
          const { data: resources } = await supabase
            .from('resources')
            .select('id, title, description, chapter_id')
            .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
            .eq('deleted', false)
            .limit(5);

          if (resources) {
            searchResults.push(...resources.map(r => ({
              id: r.id,
              type: 'resource' as const,
              title: r.title,
              description: r.description,
              chapterId: r.chapter_id,
            })));
          }
        }

        // Search questions
        if (filter === 'all' || filter === 'questions') {
          const { data: questions } = await supabase
            .from('questions')
            .select('id, data, chapter_id')
            .ilike('data', `%${query}%`)
            .eq('deleted', false)
            .limit(5);

          if (questions) {
            searchResults.push(...questions.map(q => ({
              id: q.id,
              type: 'question' as const,
              title: q.data.substring(0, 100),
              chapterId: q.chapter_id,
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
  }, [query, filter]);

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
                    className="w-full p-4 text-left rounded-lg border hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1">{getIcon(result.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-xs">
                            {result.type}
                          </Badge>
                        </div>
                        <p className="font-medium truncate">{result.title}</p>
                        {result.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
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
