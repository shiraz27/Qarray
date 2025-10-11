import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { MessageSquare, FileText, Bookmark, ArrowLeft, Brain } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomNavigation } from "@/components/BottomNavigation";
import { BookmarkSkeleton } from "@/components/LoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";
import qarayLogo from "@/assets/qarray-logo-new.png";
import { extractMediaFromText } from "@/utils/mediaHelpers";

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

  const handleTabChange = (tab: string) => {
    if (tab === "subjects") {
      navigate("/");
    } else if (tab === "profile") {
      navigate("/profile");
    } else {
      setActiveTab(tab);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (!user) {
        navigate("/login");
      }
    });
  }, [navigate]);

  useEffect(() => {
    const fetchBookmarks = async () => {
      if (!user) return;

      setLoading(true);
      try {
        const { data: bookmarksData, error: bookmarksError } = await supabase
          .from("bookmarks")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (bookmarksError) throw bookmarksError;

        const items: BookmarkedItem[] = [];

        for (const bookmark of bookmarksData || []) {
          if (bookmark.chapter_id) {
            // Fetch chapter with subject
            const { data: chapter } = await supabase
              .from("chapters")
              .select("id, name, subject_id")
              .eq("id", bookmark.chapter_id)
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
          } else if (bookmark.content_type === 'question') {
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
          }
        }

        setBookmarkedItems(items);
      } catch (error) {
        console.error("Error fetching bookmarks:", error);
        toast.error(t("errorLoadingBookmarks") || "Failed to load bookmarks");
      } finally {
        setLoading(false);
      }
    };

    fetchBookmarks();
  }, [user, t]);

  const removeBookmark = async (itemId: string) => {
    if (!user) return;

    try {
      const bookmarkId = itemId.split('-')[1];
      await supabase.from("bookmarks").delete().eq("id", bookmarkId).eq("user_id", user.id);

      setBookmarkedItems((prev) => prev.filter((item) => item.id !== itemId));
      toast.success(t("bookmarkRemoved") || "Bookmark removed");
    } catch (error) {
      console.error("Error removing bookmark:", error);
      toast.error(t("bookmarkError") || "Failed to remove bookmark");
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

  const groupedItems = {
    chapters: bookmarkedItems.filter(item => item.type === 'chapter'),
    memorizations: bookmarkedItems.filter(item => item.type === 'memorization'),
    questions: bookmarkedItems.filter(item => item.type === 'question'),
    answers: bookmarkedItems.filter(item => item.type === 'answer'),
    resources: bookmarkedItems.filter(item => item.type === 'resource'),
  };

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
      {/* Top Navigation */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="hover-scale">
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
        <h1 className="text-2xl font-bold text-foreground mb-6">{t("bookmarks") || "Bookmarks"}</h1>

        {loading ? (
          <BookmarkSkeleton />
        ) : bookmarkedItems.length === 0 ? (
          <EmptyState type="bookmarks" message={t("noBookmarks") || "You haven't bookmarked anything yet"} />
        ) : (
          <div className="space-y-8">
            {/* Chapters Section */}
            {groupedItems.chapters.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <FileText size={20} className="text-primary" />
                  {t("chapters") || "Chapters"} ({groupedItems.chapters.length})
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
                  {t("memorizations") || "Memorizations"} ({groupedItems.memorizations.length})
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
                  {t("questions") || "Questions"} ({groupedItems.questions.length})
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
                  {t("answers") || "Answers"} ({groupedItems.answers.length})
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
                  {t("resources") || "Resources"} ({groupedItems.resources.length})
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