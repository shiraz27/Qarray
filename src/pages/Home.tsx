import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LogOut, BookOpen, FileText, User as UserIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const Home = () => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          navigate("/");
        } else {
          setUser(session.user);
          if (session.user) {
            setTimeout(() => {
              fetchProfile(session.user.id);
            }, 0);
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/");
    } else {
      setUser(session.user);
      await fetchProfile(session.user.id);
    }
    setLoading(false);
  };

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("Error fetching profile:", error);
    } else {
      setProfile(data);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: t("error.error"),
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: t("success.loggedOut"),
        description: t("success.loggedOutDesc"),
      });
      navigate("/");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="bg-card border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-primary">{t("home.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("home.subtitle")}</p>
            </div>
            <div className="flex gap-2">
              <LanguageSwitcher />
              <Button onClick={handleLogout} variant="outline" size="sm">
                <LogOut className="w-4 h-4 mx-2" />
                {t("home.logout")}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="bg-card rounded-2xl shadow-xl border p-8 mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <UserIcon className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                {t("home.welcome")}, {profile?.full_name || user?.email?.split("@")[0]}!
              </h2>
              <p className="text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-card rounded-xl shadow-lg border p-6 hover:shadow-xl transition-shadow cursor-pointer">
            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
              <BookOpen className="w-6 h-6 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{t("home.subjects")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("home.subjectsDesc")}
            </p>
          </div>

          <div className="bg-card rounded-xl shadow-lg border p-6 hover:shadow-xl transition-shadow cursor-pointer">
            <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{t("home.resources")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("home.resourcesDesc")}
            </p>
          </div>

          <div className="bg-card rounded-xl shadow-lg border p-6 hover:shadow-xl transition-shadow cursor-pointer">
            <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center mb-4">
              <UserIcon className="w-6 h-6 text-purple-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{t("home.profile")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("home.profileDesc")}
            </p>
          </div>
        </div>

        <div className="mt-8 bg-card rounded-2xl shadow-xl border p-8">
          <h3 className="text-xl font-bold mb-6">{t("home.stats")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-1">0</div>
              <div className="text-sm text-muted-foreground">{t("home.statsSubjects")}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-500 mb-1">0</div>
              <div className="text-sm text-muted-foreground">{t("home.statsLessons")}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500 mb-1">0</div>
              <div className="text-sm text-muted-foreground">{t("home.statsExercises")}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-500 mb-1">0</div>
              <div className="text-sm text-muted-foreground">{t("home.statsSummaries")}</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;
