import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, FileText, Bookmark, ArrowLeft, Brain, Search, Filter, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomNavigation } from "@/components/BottomNavigation";
import { BookmarkSkeleton } from "@/components/LoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";
import qarayLogo from "@/assets/qarray-logo-new.png";
import { extractMediaFromText } from "@/utils/mediaHelpers";
import { SEO, createWebPageSchema } from "@/components/SEO";

interface BookmarkedItem {
  id: string;
  type: 'chapter' | 'question' | 'answer' | 'resource' | 'memorization';
  title: string;
  description?: string;
  chapterName?: string;
  subjectName?: string;
  created_at: string;
  actualId: number;
}

export default function Bookmarks() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [bookmarkedItems, setBookmarkedItems] = useState<BookmarkedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("bookmarks");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");

  const handleTabChange = (tab: string) => {
    if (tab === "subjects") {
      navigate("/dashboard");
    } else if (tab === "profile") {
      navigate("/profile");
    } else {
      setActiveTab(tab);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user);
      } else {
        navigate("/login");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (!u) navigate("/login");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const fetchBookmarks = async () => {
      if (!user) return;

      setLoading(true);
      try {
        console.log("Fetching bookmarks for user:", user.id);
        const { data: bookmarksData, error: bookmarksError } = await supabase
          .from("bookmarks")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (bookmarksError) throw bookmarksError;

        if (bookmarksData && bookmarksData.length > 0) {
          toast.info(`Found ${bookmarksData.length} bookmarks. Processing details...`, { duration: 2000 });
        } else {
          toast.info("No bookmarks found in database", { duration: 2000 });
        }

        const items: BookmarkedItem[] = [];
console.log('bookmarksData', bookmarksData)
        for (const bookmark of bookmarksData || []) {
          try {
            if (bookmark.content_type === 'question') {
              const { data: question } = await supabase
                .from("questions")
                .select("id, data, chapter_id")
                .eq("id", bookmark.content_id)
                .eq("deleted", false)
                .maybeSingle();
              if (question) {
                const { data: chapter } = await supabase
                  .from("chapters")
                  .select("name, subject_id")
                  .eq("id", question.chapter_id)
                  .maybeSingle();

                let subjectName = "";
                if (chapter) {
                  const { data: subject } = await supabase
                    .from("subjects")
                    .select("name")
                    .eq("id", chapter.subject_id)
                    .maybeSingle();
                  subjectName = subject?.name || "";
                }

                const { text } = extractMediaFromText(question.data);
                items.push({
                  id: `question-${bookmark.id}`,
                  type: 'question',
                  title: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                  chapterName: chapter?.name,
                  subjectName,
                  created_at: bookmark.created_at,
                  actualId: question.id
                });
              }
            } else if (bookmark.content_type === 'answer') {
              const { data: answer } = await supabase
                .from("answers")
                .select("id, data, question_id")
                .eq("id", bookmark.content_id)
                .eq("deleted", false)
                .maybeSingle();

              if (answer) {
                const { data: question } = await supabase
                  .from("questions")
                  .select("data, chapter_id")
                  .eq("id", answer.question_id)
                  .maybeSingle();

                let chapterName = "";
                let subjectName = "";
                if (question) {
                  const { data: chapter } = await supabase
                    .from("chapters")
                    .select("name, subject_id")
                    .eq("id", question.chapter_id)
                    .maybeSingle();

                  if (chapter) {
                    chapterName = chapter.name;
                    const { data: subject } = await supabase
                      .from("subjects")
                      .select("name")
                      .eq("id", chapter.subject_id)
                      .maybeSingle();
                    subjectName = subject?.name || "";
                  }
                }

              const { text: answerText } = extractMediaFromText(answer.data);
              const { text: questionText } = question ? extractMediaFromText(question.data) : { text: '' }; 
                items.push({
                  id: `answer-${bookmark.id}`,
                  type: 'answer',
                  title: answerText.substring(0, 100) + (answerText.length > 100 ? '...' : ''),
                  description: question ? `Answer to: ${questionText.substring(0, 50)}...` : undefined,
                  chapterName,
                  subjectName,
                  created_at: bookmark.created_at,
                  actualId: answer.id
                });
              }
            } else if (bookmark.content_type === 'resource') {
              const { data: resource } = await supabase
                .from("resources")
                .select("id, title, description, chapter_id")
                .eq("id", bookmark.content_id)
                .eq("deleted", false)
                .maybeSingle();

              if (resource) {
                const { data: chapter } = await supabase
                  .from("chapters")
                  .select("name, subject_id")
                  .eq("id", resource.chapter_id)
                  .maybeSingle();

                let subjectName = "";
                if (chapter) {
                  const { data: subject } = await supabase
                    .from("subjects")
                    .select("name")
                    .eq("id", chapter.subject_id)
                    .maybeSingle();
                  subjectName = subject?.name || "";
                }

                items.push({
                  id: `resource-${bookmark.id}`,
                  type: 'resource',
                title: resource.title,
                description: resource.description,
                chapterName: chapter?.name,
                  subjectName,
                created_at: bookmark.created_at,
                  actualId: resource.id
                });
              }
            } else if (bookmark.content_type === 'memorization') {
              const { data: memorization } = await supabase
                .from("memorizations")
                .select("id, title, description, subject_id")
                .eq("id", bookmark.content_id)
                .eq("deleted", false)
                .maybeSingle();

              if (memorization) {
                let subjectName = "";
                if (memorization.subject_id) {
                  const { data: subject } = await supabase
                    .from("subjects")
                    .select("name")
                    .eq("id", memorization.subject_id)
                    .maybeSingle();
                  subjectName = subject?.name || "";
                }

                items.push({
                  id: `memorization-${bookmark.id}`,
                  type: 'memorization',
                title: memorization.title,
                  description: memorization.description || undefined,
                  subjectName,
                created_at: bookmark.created_at,
                  actualId: memorization.id
                });
              }
            } else if (bookmark.content_type === 'chapter') {
              console.log('were here')
            // Fetch chapter with subject
              const { data: chapter } = await supabase
                .from("chapters")
                .select("id, name, subject_id")
                .eq("id", bookmark.content_id)
                .eq("deleted", false)
                .maybeSingle();

              if (chapter) {
                const { data: subject } = await supabase
                  .from("subjects")
                  .select("name")
                  .eq("id", chapter.subject_id)
                  .maybeSingle();

                items.push({
                  id: `chapter-${bookmark.id}`,
                  type: 'chapter',
                  title: chapter.name,
                  subjectName: subject?.name || "",
                  created_at: bookmark.created_at,
                  actualId: chapter.id
                });
              }
            } 
          } catch (itemErr) {
            console.error("Error processing bookmark item:", itemErr, bookmark);
          }
        }

        console.log(`Setting ${items.length} bookmarked items`);
        setBookmarkedItems(items);
      } catch (error) {
        console.error("Error fetching bookmarks:", error);
        toast.error(t("errorLoadingBookmarks", "Failed to load bookmarks"));
      } finally {
        setLoading(false);
      }
    };

    fetchBookmarks();
  }, [user, t]);

  const removeBookmark = async (itemId: string) => {
    if (!user) return;

    try {
      const bookmarkId = itemId.substring(itemId.indexOf('-') + 1);
      await supabase.from("bookmarks").delete().eq("id", bookmarkId).eq("user_id", user.id);

      setBookmarkedItems((prev) => prev.filter((item) => item.id !== itemId));
      toast.success(t("bookmarkRemoved", "Bookmark removed"));
    } catch (error) {
      console.error("Error removing bookmark:", error);
      toast.error(t("bookmarkError", "Failed to remove bookmark"));
    }
  };

  const handleItemClick = (item: BookmarkedItem) => {
    if (item.type === 'chapter') {
      navigate(`/chapter/${item.actualId}`);
    } else if (item.type === 'question') {
      navigate(`/question/${item.actualId}`);
    } else if (item.type === 'answer') {
      navigate(`/question/${item.actualId}`);
    } else if (item.type === 'resource') {
      navigate(`/resource/${item.actualId}`);
    } else if (item.type === 'memorization') {
      navigate(`/memorization/${item.actualId}`);
    }
  };

  const filteredItems = useMemo(() => {
    return bookmarkedItems.filter((item) => {
      const title = item.title || "";
      const description = item.description || "";
      const subjectName = item.subjectName || "";
      const chapterName = item.chapterName || "";
      const query = searchQuery.toLowerCase();

      const matchesSearch =
        title.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query) ||
        subjectName.toLowerCase().includes(query) ||
        chapterName.toLowerCase().includes(query);

      const matchesType = selectedType === "all" || item.type === selectedType;
      const matchesSubject = selectedSubject === "all" || (item.subjectName || "None") === selectedSubject;

      return matchesSearch && matchesType && matchesSubject;
    });
  }, [bookmarkedItems, searchQuery, selectedType, selectedSubject]);

  const subjects = useMemo(() => {
    return Array.from(
      new Set(bookmarkedItems.map((item) => item.subjectName || "None"))
    ).sort();
  }, [bookmarkedItems]);

  const groupedItems = useMemo(() => {
    return {
      chapters: filteredItems.filter(item => item.type === 'chapter'),
      memorizations: filteredItems.filter(item => item.type === 'memorization'),
      questions: filteredItems.filter(item => item.type === 'question'),
      answers: filteredItems.filter(item => item.type === 'answer'),
      resources: filteredItems.filter(item => item.type === 'resource'),
    };
  }, [filteredItems]);

  console.log('shishi', filteredItems, subjects)
  const renderBookmarkCard = (item: BookmarkedItem) => (
    <Card
      key={item.id}
      className="p-4 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all cursor-pointer"
      onClick={() => handleItemClick(item)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {item.subjectName && (
            <p className="text-xs text-muted-foreground mb-1">{item.subjectName}</p>
          )}
          {item.chapterName && (
            <p className="text-xs text-muted-foreground mb-1">{item.chapterName}</p>
          )}
          <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
          {item.description && (
            <p className="text-xs text-muted-foreground">{item.description}</p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeBookmark(item.id);
          }}
          className="hover:scale-110 transition-transform ml-2"
        >
          <Bookmark size={20} className="text-foreground fill-foreground" />
        </button>
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO
        title={t('bookmarks', 'Bookmarks')}
        description="Your saved bookmarks on Qarray"
        url="/bookmarks"
        noindex={true}
        jsonLd={createWebPageSchema('Bookmarks - Qarray', 'View your saved bookmarks', '/bookmarks')}
      />
      
      {/* Top Navigation */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="hover-scale">
            <ArrowLeft size={20} />
          </Button>
          <div className="flex items-center gap-2">
            <img src={qarayLogo} alt="Qarray Logo" className="h-12 w-12 object-contain" />
            <span className="text-xl font-bold text-foreground">Qarray</span>
          </div>
          <div className="w-10" />
        </div>
      </div>

      <main className="flex-1 w-full px-4 pb-4 mb-24 mt-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">{t("bookmarks", "Bookmarks")}</h1>

        {/* Search and Filters */}
        <div className="space-y-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder={t("searchBookmarks", "Search bookmarks...")}
              className="pl-9 pr-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <Filter size={18} className="text-muted-foreground shrink-0" />
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[140px] h-8 text-xs shrink-0">
                <SelectValue placeholder={t("allTypes", "All types")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allTypes", "All types")}</SelectItem>
                <SelectItem value="chapter">{t("chapters", "Chapters")}</SelectItem>
                <SelectItem value="memorization">{t("memorizations", "Memorizations")}</SelectItem>
                <SelectItem value="question">{t("questions", "Questions")}</SelectItem>
                <SelectItem value="answer">{t("answers", "Answers")}</SelectItem>
                <SelectItem value="resource">{t("resources", "Resources")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger className="w-[140px] h-8 text-xs shrink-0">
                <SelectValue placeholder={t("allSubjects", "All subjects")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allSubjects", "All subjects")}</SelectItem>
                {subjects.map((subject) => (
                  <SelectItem key={subject} value={subject}>
                    {subject}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <BookmarkSkeleton />
        ) : bookmarkedItems.length === 0 ? (
          <EmptyState type="bookmarks" message={t("noBookmarks", "You haven't bookmarked anything yet")} />
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="text-muted-foreground h-8 w-8" />
            </div>
            <p className="text-muted-foreground">{t("noResultsFound", "No results found for your search")}</p>
            <Button
              variant="link"
              onClick={() => {
                setSearchQuery("");
                setSelectedType("all");
                setSelectedSubject("all");
              }}
              className="mt-2"
            >
              {t("clearFilters", "Clear all filters")}
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Chapters Section */}
            {groupedItems.chapters.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <FileText size={20} className="text-primary" />
                  {t("chapters", "Chapters")} ({groupedItems.chapters.length})
                </h2>
                <div className="space-y-3">
                  {groupedItems.chapters.map(renderBookmarkCard)}
                </div>
              </div>
            )}

            {/* Memorizations Section */}
            {groupedItems.memorizations.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Brain size={20} style={{ color: '#703627' }} />
                  {t("memorizations", "Memorizations")} ({groupedItems.memorizations.length})
                </h2>
                <div className="space-y-3">
                  {groupedItems.memorizations.map(renderBookmarkCard)}
                </div>
              </div>
            )}

            {/* Questions Section */}
            {groupedItems.questions.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <MessageSquare size={20} className="text-primary" />
                  {t("questions", "Questions")} ({groupedItems.questions.length})
                </h2>
                <div className="space-y-3">
                  {groupedItems.questions.map(renderBookmarkCard)}
                </div>
              </div>
            )}

            {/* Answers Section */}
            {groupedItems.answers.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <MessageSquare size={20} className="text-green-600" />
                  {t("answers", "Answers")} ({groupedItems.answers.length})
                </h2>
                <div className="space-y-3">
                  {groupedItems.answers.map(renderBookmarkCard)}
                </div>
              </div>
            )}

            {/* Resources Section */}
            {groupedItems.resources.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <FileText size={20} style={{ color: '#F6A18A' }} />
                  {t("resources", "Resources")} ({groupedItems.resources.length})
                </h2>
                <div className="space-y-3">
                  {groupedItems.resources.map(renderBookmarkCard)}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
    </div>
  );
}
