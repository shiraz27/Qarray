import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

export function MediaSearchDialog() {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }

    setIsSearching(true);
    try {
      // Get user's class_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in to search");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("class_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.class_id) {
        toast.error("Please complete your profile first");
        return;
      }

      // Call the search function
      const { data, error } = await supabase.rpc("search_pdf_content", {
        search_query: searchQuery,
        user_class_id: profile.class_id,
      });

      if (error) {
        console.error("Search error:", error);
        toast.error("Search failed");
        return;
      }

      setResults(data || []);
      
      if (!data || data.length === 0) {
        toast.info("No results found");
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    navigate(`/resource/${result.id}`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Search className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Search Documents & Images</DialogTitle>
        </DialogHeader>
        
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Search for text in documents and images..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={isSearching}>
            {isSearching ? "Searching..." : "Search"}
          </Button>
        </div>

        <div className="space-y-4">
          {results.map((result) => (
            <Card 
              key={result.id} 
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => handleResultClick(result)}
            >
              <CardHeader>
                <CardTitle className="text-lg">{result.title}</CardTitle>
                <CardDescription>{result.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  ...{result.match_snippet}...
                </p>
              </CardContent>
            </Card>
          ))}
          
          {!isSearching && results.length === 0 && searchQuery && (
            <p className="text-center text-muted-foreground py-8">
              No results found. Try different keywords.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
