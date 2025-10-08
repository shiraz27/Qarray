import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, isRTL } = useLanguage();

  useEffect(() => {
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
        title: t("error.invalidEmail"),
        description: t("error.invalidEmailDesc"),
        variant: "destructive",
      });
      return;
    }

    if (!validatePassword(password)) {
      toast({
        title: t("error.invalidPassword"),
        description: t("error.invalidPasswordDesc"),
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
              title: t("error.loginFailed"),
              description: t("error.invalidCredentials"),
              variant: "destructive",
            });
          } else {
            toast({
              title: t("error.error"),
              description: error.message,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: t("success.welcomeBack"),
            description: t("success.welcomeBackDesc"),
          });
        }
      } else {
        if (!fullName.trim()) {
          toast({
            title: t("error.fullNameRequired"),
            description: t("error.fullNameRequiredDesc"),
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
              title: t("error.accountExists"),
              description: t("error.accountExistsDesc"),
              variant: "destructive",
            });
          } else {
            toast({
              title: t("error.signupFailed"),
              description: signUpError.message,
              variant: "destructive",
            });
          }
        } else if (data.user) {
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
            title: t("success.accountCreated"),
            description: t("success.accountCreatedDesc"),
          });
        }
      }
    } catch (error: any) {
      toast({
        title: t("error.error"),
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">{t("auth.title")}</h1>
          <p className="text-muted-foreground">{t("auth.subtitle")}</p>
        </div>

        <div className="bg-card rounded-2xl shadow-xl border p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-center mb-2">
              {isLogin ? t("auth.loginTitle") : t("auth.signupTitle")}
            </h2>
            <p className="text-center text-sm text-muted-foreground">
              {isLogin ? t("auth.loginSubtitle") : t("auth.signupSubtitle")}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">{t("auth.fullName")}</Label>
                <div className="relative">
                  <Input
                    id="fullName"
                    type="text"
                    placeholder={t("auth.fullNamePlaceholder")}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={isRTL ? "pr-10" : "pl-10"}
                    required={!isLogin}
                  />
                  <Mail className={`absolute ${isRTL ? "right-3" : "left-3"} top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4`} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={isRTL ? "pr-10" : "pl-10"}
                  required
                />
                <Mail className={`absolute ${isRTL ? "right-3" : "left-3"} top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4`} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="px-10"
                  required
                />
                <Lock className={`absolute ${isRTL ? "right-3" : "left-3"} top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4`} />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute ${isRTL ? "left-3" : "right-3"} top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground`}
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
                  {t("auth.passwordHint")}
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
                ? t("auth.loading")
                : isLogin
                ? t("auth.loginButton")
                : t("auth.signupButton")}
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
              {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          {t("auth.terms")}{" "}
          <a href="#" className="text-primary hover:underline">
            {t("auth.termsLink")}
          </a>{" "}
          {t("auth.and")}{" "}
          <a href="#" className="text-primary hover:underline">
            {t("auth.privacyLink")}
          </a>
        </p>
      </div>
    </div>
  );
};

export default Auth;
