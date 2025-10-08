import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/home");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          navigate("/home");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string) => {
    return password.length >= 6;
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEmail(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    if (!validatePassword(password)) {
      toast({
        title: "Invalid password",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast({
              title: "Login failed",
              description: "Invalid email or password",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Error",
              description: error.message,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Welcome back!",
            description: "You've successfully logged in",
          });
        }
      } else {
        if (!fullName.trim()) {
          toast({
            title: "Full name required",
            description: "Please enter your full name",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const { error: signUpError, data } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/home`,
            data: {
              full_name: fullName,
            },
          },
        });

        if (signUpError) {
          if (signUpError.message.includes("already registered")) {
            toast({
              title: "Account exists",
              description: "This email is already registered. Please login instead.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Signup failed",
              description: signUpError.message,
              variant: "destructive",
            });
          }
        } else if (data.user) {
          // Create profile
          const { error: profileError } = await supabase
            .from("profiles")
            .insert({
              user_id: data.user.id,
              full_name: fullName,
            });

          if (profileError) {
            console.error("Profile creation error:", profileError);
          }

          toast({
            title: "Account created!",
            description: "Welcome to Qarray",
          });
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">Qarray</h1>
          <p className="text-muted-foreground">
            منصة التعليم الإلكتروني
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-card rounded-2xl shadow-xl border p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-center mb-2">
              {isLogin ? "تسجيل الدخول" : "إنشاء حساب"}
            </h2>
            <p className="text-center text-sm text-muted-foreground">
              {isLogin
                ? "أدخل بيانات الدخول الخاصة بك"
                : "قم بإنشاء حسابك الجديد"}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">الاسم الكامل</Label>
                <div className="relative">
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="أدخل اسمك الكامل"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pr-10"
                    required={!isLogin}
                  />
                  <Mail className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pr-10"
                  required
                />
                <Mail className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10 pl-10"
                  required
                />
                <Lock className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {!isLogin && (
                <p className="text-xs text-muted-foreground">
                  يجب أن تحتوي كلمة المرور على 6 أحرف على الأقل
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading}
            >
              {loading
                ? "جاري التحميل..."
                : isLogin
                ? "تسجيل الدخول"
                : "إنشاء حساب"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setFullName("");
                setEmail("");
                setPassword("");
              }}
              className="text-sm text-primary hover:underline"
            >
              {isLogin
                ? "ليس لديك حساب؟ سجل الآن"
                : "لديك حساب بالفعل؟ سجل الدخول"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          بتسجيل الدخول، أنت توافق على{" "}
          <a href="#" className="text-primary hover:underline">
            شروط الخدمة
          </a>{" "}
          و{" "}
          <a href="#" className="text-primary hover:underline">
            سياسة الخصوصية
          </a>
        </p>
      </div>
    </div>
  );
};

export default Auth;
