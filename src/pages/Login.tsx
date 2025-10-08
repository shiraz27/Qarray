import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import qarayLogo from '@/assets/qarray-logo.png';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`
          }
        });

        if (error) throw error;

        toast({
          title: t('success'),
          description: t('accountCreated'),
        });
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        toast({
          title: t('welcomeBack'),
          description: t('welcomeBackMessage'),
        });
        navigate('/');
      }
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'facebook') => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/`
        }
      });

      if (error) throw error;
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Logo */}
        <div className="mb-4">
          <img
            src={qarayLogo}
            alt="Qarray Logo"
            className="w-32 h-32 object-contain"
          />
        </div>
        <h2 className="text-xl font-semibold mb-8 text-gray-800">Qarray</h2>

        <h1 className="text-2xl font-bold mb-2">
          {isSignUp ? t('createAccount') : t('welcomeBack')}
        </h1>
        <p className="text-gray-600 mb-8">
          {isSignUp ? t('signUpMessage') : t('signInMessage')}
        </p>

        {/* Social Login Buttons */}
        <div className="w-full max-w-sm space-y-3 mb-6">
          <Button
            onClick={() => handleSocialLogin('facebook')}
            variant="outline"
            className="w-full h-12 flex items-center justify-center gap-3 border-2 hover:bg-gray-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#1877F2"
                d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
              />
            </svg>
            <span className="font-medium">{t('facebook')}</span>
          </Button>

          {/* Google login - commented out temporarily */}
          {/* <Button
            onClick={() => handleSocialLogin('google')}
            variant="outline"
            className="w-full h-12 flex items-center justify-center gap-3 border-2 hover:bg-gray-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span className="font-medium">Google</span>
          </Button> */}
        </div>

        {/* Divider */}
        <div className="w-full max-w-sm flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-gray-300"></div>
          <span className="text-sm text-gray-500">{t('orWithEmail')}</span>
          <div className="flex-1 h-px bg-gray-300"></div>
        </div>

        {/* Email Form */}
        <form onSubmit={handleEmailAuth} className="w-full max-w-sm space-y-4">
          <div>
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 text-base"
            />
          </div>

          <div>
            <Label htmlFor="password">{t('password')}</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 text-base"
            />
          </div>

          <Button 
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-[#38A6FF] hover:bg-[#2B8FE8] text-white text-base font-medium rounded-lg"
          >
            {loading ? t('loading') : (isSignUp ? t('signUp') : t('signIn'))}
          </Button>
        </form>

        {/* Toggle Sign Up/Sign In */}
        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="mt-6 text-sm text-gray-600 hover:text-gray-900"
        >
          {isSignUp ? t('alreadyHaveAccount') : t('dontHaveAccount')}
        </button>
      </div>
    </div>
  );
};

export default Login;
