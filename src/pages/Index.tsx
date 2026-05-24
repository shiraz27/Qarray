import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { ActionButtons } from '@/components/ActionButtons';
import { SubjectTabs } from '@/components/SubjectTabs';
import { MainContent } from '@/components/MainContent';
import { BottomNavigation } from '@/components/BottomNavigation';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Search, Trophy, Star, Sparkles, Award, Zap, Target } from 'lucide-react';
import { GlobalSearch } from '@/components/GlobalSearch';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import qarayLogo from '@/assets/qarray-logo-new.png';
import educationPattern from '@/assets/education-pattern.png';
import { TutorialDialog } from '@/components/TutorialDialog';
import { SEO, createWebPageSchema } from '@/components/SEO';

const Index: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<{ full_name: string; class_id: number } | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const handleTabChange = (tab: string) => {
    if (tab === 'bookmarks') {
      navigate('/bookmarks');
    } else if (tab === 'classmates') {
      navigate('/classmates');
    } else if (tab === 'profile') {
      navigate('/profile');
    }
  };

  useEffect(() => {
    let cancelled = false;

    const checkProfileAndSetState = async (session: Session) => {
      // gate: only run once session exists; also avoid transient redirect while loading
      setUserProfile(null);
      setTutorialOpen(false);

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('phone_number, state_id, class_id, full_name, user_type, tutorial_completed, tutorial_step')
        .eq('user_id', session.user.id)
        .single();

      if (cancelled) return;

      if (error || !profile) {
        // If we can't fetch the profile record, don't aggressively redirect during transient states.
        // Let the user continue; future auth/profile updates will handle it.
        return;
      }

      const phoneOk = !!profile.phone_number;
      const stateOk = profile.state_id !== null && profile.state_id !== undefined;
      const classOk = profile.class_id !== null && profile.class_id !== undefined;

      if (!phoneOk || !stateOk || !classOk) {
        navigate('/complete-profile');
        return;
      }

      setUserProfile({ full_name: profile.full_name, class_id: profile.class_id });

      if (profile.user_type === 'student' && !profile.tutorial_completed) {
        setTutorialOpen(true);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        if (!nextSession) {
          navigate('/');
          return;
        }
        void checkProfileAndSetState(nextSession);
      }
    );

    // Initial load: get the current session, but do NOT duplicate the profile fetch
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      if (!initialSession) {
        navigate('/');
      } else {
        void checkProfileAndSetState(initialSession);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate]);


  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      <SEO
        title="Dashboard"
        description="Your personalized learning dashboard"
        url="/dashboard"
        noindex={true}
        jsonLd={createWebPageSchema('Dashboard - Qarray', 'Your learning dashboard', '/dashboard')}
      />
      {/* Animated Background Pattern - Always visible */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/* Education pattern background */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url(${educationPattern})`,
            backgroundSize: '400px 400px',
            backgroundRepeat: 'repeat',
            backgroundPosition: 'center'
          }}
        />
        
        {/* Gradient overlay on top of pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#F6A18A]/10 via-transparent to-[hsl(207,89%,54%)]/10" />
        
        {/* Geometric shapes for e-learning theme */}
        <div className="absolute top-20 left-10 w-48 h-48 bg-[#F6A18A]/15 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-40 right-20 w-56 h-56 bg-[hsl(207,89%,54%)]/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-96 left-1/4 w-52 h-52 bg-[#F6A18A]/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[600px] right-1/3 w-48 h-48 bg-[hsl(207,89%,54%)]/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '3s' }} />
      </div>


      <div className="w-full mx-auto flex flex-col min-h-screen relative z-10">
        <div className="flex-1 w-full overflow-auto pb-24">
          <section className="items-stretch flex w-full flex-col bg-background/90 backdrop-blur-sm relative z-10">
            <Header userName={userProfile?.full_name || 'User'} />
            
            <div className="flex flex-col items-center mt-6 mb-4 gap-4 relative">
              {/* Floating Gamification Icons - Around Welcome Badge */}
              <div className="absolute -top-4 left-0 right-0 h-32 pointer-events-none overflow-visible">
                <Trophy className="absolute top-0 left-[10%] w-6 h-6 text-primary/30 animate-float" />
                <Star className="absolute top-2 right-[10%] w-5 h-5 text-[hsl(14,92%,76%)]/40 animate-float-delayed" />
                <Sparkles className="absolute top-8 left-[5%] w-4 h-4 text-primary/25 animate-sparkle" />
                <Award className="absolute top-4 right-[5%] w-5 h-5 text-primary/30 animate-float-slow" />
                <Zap className="absolute top-10 left-[15%] w-4 h-4 text-[hsl(14,92%,76%)]/35 animate-float-delayed" />
                <Target className="absolute top-6 right-[15%] w-4 h-4 text-primary/20 animate-sparkle" />
              </div>
              
              {/* Welcome Badge with Username */}
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 animate-bounce-slow">
                <Sparkles className="w-4 h-4 text-primary animate-sparkle" />
                <span className="text-sm font-medium text-primary">
                  Welcome back, {userProfile?.full_name || 'User'}!
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* Logo with glow effect */}
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-glow-pulse" />
                  <img
                    src={qarayLogo}
                    className="relative h-16 w-16 object-contain hover-scale"
                    alt="Qarray Logo"
                  />
                </div>
                <h1 className="text-4xl font-bold text-foreground">
                  Qarray
                </h1>
              </div>
              
              <Button
                variant="outline"
                size="lg"
                onClick={() => setSearchOpen(true)}
                className="w-[90%] max-w-md justify-start gap-2 hover:bg-background hover:border-border transition-all"
              >
                <Search className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Search anything...</span>
              </Button>
            </div>
            
            <ActionButtons />
          </section>
          
          <SubjectTabs 
            classId={userProfile?.class_id} 
            onSubjectChange={setSelectedSubject}
          />
          <MainContent subjectId={selectedSubject} viewingClassId={userProfile?.class_id ?? null} />
        </div>
        
        <BottomNavigation onTabChange={handleTabChange} activeTab="subjects" />
      </div>
      
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <TutorialDialog open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    </div>
  );
};

export default Index;
