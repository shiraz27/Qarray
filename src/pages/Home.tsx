import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LogOut, BookOpen, FileText, User as UserIcon } from "lucide-react";

const Home = () => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          navigate("/");
        } else {
          setUser(session.user);
          if (session.user) {
            fetchProfile(session.user.id);
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
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "تم تسجيل الخروج",
        description: "تم تسجيل خروجك بنجاح",
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
      {/* Header */}
      <header className="bg-card border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-primary">Qarray</h1>
              <p className="text-sm text-muted-foreground">منصة التعليم الإلكتروني</p>
            </div>
            <Button onClick={handleLogout} variant="outline" size="sm">
              <LogOut className="w-4 h-4 ml-2" />
              تسجيل الخروج
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="bg-card rounded-2xl shadow-xl border p-8 mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <UserIcon className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                مرحباً، {profile?.full_name || user?.email?.split("@")[0]}!
              </h2>
              <p className="text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-card rounded-xl shadow-lg border p-6 hover:shadow-xl transition-shadow cursor-pointer">
            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
              <BookOpen className="w-6 h-6 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">المواد الدراسية</h3>
            <p className="text-sm text-muted-foreground">
              تصفح المواد الدراسية والمحتوى التعليمي
            </p>
          </div>

          <div className="bg-card rounded-xl shadow-lg border p-6 hover:shadow-xl transition-shadow cursor-pointer">
            <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">الموارد التعليمية</h3>
            <p className="text-sm text-muted-foreground">
              الوصول إلى الدروس والتمارين والملخصات
            </p>
          </div>

          <div className="bg-card rounded-xl shadow-lg border p-6 hover:shadow-xl transition-shadow cursor-pointer">
            <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center mb-4">
              <UserIcon className="w-6 h-6 text-purple-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">الملف الشخصي</h3>
            <p className="text-sm text-muted-foreground">
              إدارة معلوماتك الشخصية وإعداداتك
            </p>
          </div>
        </div>

        {/* Stats Section */}
        <div className="mt-8 bg-card rounded-2xl shadow-xl border p-8">
          <h3 className="text-xl font-bold mb-6">إحصائياتك</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-1">0</div>
              <div className="text-sm text-muted-foreground">المواد</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-500 mb-1">0</div>
              <div className="text-sm text-muted-foreground">الدروس</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500 mb-1">0</div>
              <div className="text-sm text-muted-foreground">التمارين</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-500 mb-1">0</div>
              <div className="text-sm text-muted-foreground">الملخصات</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;
