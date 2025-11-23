import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

interface SearchResult {
  id: number;
  title: string;
  description: string;
  chapter_id: number;
  subject_id: number;
  data: string[];
  match_snippet: string;
  rank: number;
}

export function PdfSearchDialog() {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: 'Enter search query',
        description: 'Please enter text to search for',
        variant: 'destructive',
      });
      return;
    }

    setIsSearching(true);
    try {
      // Get user's class_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('class_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.class_id) {
        throw new Error('Profile not found');
      }

      // Call the search function
      const { data, error } = await supabase.rpc('search_pdf_content', {
        search_query: searchQuery,
        user_class_id: profile.class_id,
      });

      if (error) throw error;

      setResults(data || []);

      if (!data || data.length === 0) {
        toast({
          title: 'No results',
          description: 'No matching content found in PDF documents',
        });
      }
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: 'Search failed',
        description: error instanceof Error ? error.message : 'Failed to search PDF content',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    navigate(`/resources/${result.id}`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Search className="h-4 w-4" />
          Search PDFs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Search PDF Content
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Enter text to search in PDF documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={isSearching}>
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3">
          {results.length > 0 ? (
            results.map((result) => (
              <Card
                key={result.id}
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleResultClick(result)}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{result.title}</CardTitle>
                  <CardDescription>{result.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className="text-sm text-muted-foreground bg-muted p-3 rounded-md"
                    dangerouslySetInnerHTML={{ __html: result.match_snippet }}
                  />
                  <div className="mt-2 text-xs text-muted-foreground">
                    Relevance: {(result.rank * 100).toFixed(1)}%
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center text-muted-foreground py-8">
              {isSearching ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Searching...</span>
                </div>
              ) : searchQuery ? (
                <p>No results found</p>
              ) : (
                <p>Enter a search query to find content in PDF documents</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
