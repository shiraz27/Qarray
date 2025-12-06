import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { supabase } from '@/integrations/supabase/client';
import qarayLogo from '@/assets/qarray-logo-new.png';
import { 
  BookOpen, 
  MessageCircle, 
  Brain, 
  Search, 
  Trophy, 
  Star, 
  Sparkles, 
  Zap,
  Target,
  Award,
  Users,
  Rocket
} from 'lucide-react';
import { StatisticsSection } from '@/components/StatisticsSection';
import { GlobalSearch } from '@/components/GlobalSearch';
import { SEO } from '@/components/SEO';

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [studentCount, setStudentCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchStudentCount = async () => {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      setStudentCount(count || 0);
    };
    fetchStudentCount();
  }, []);

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: 'Qarray',
    description: t('landingSubtitle'),
    url: 'https://qarray.lovable.app',
    logo: 'https://qarray.lovable.app/qarray-logo-new.png',
  };

  const features = [
    {
      icon: BookOpen,
      title: t('landingFeature1Title'),
      description: t('landingFeature1Desc'),
      color: 'primary',
    },
    {
      icon: MessageCircle,
      title: t('landingFeature2Title'),
      description: t('landingFeature2Desc'),
      color: 'coral',
    },
    {
      icon: Brain,
      title: t('landingFeature3Title'),
      description: t('landingFeature3Desc'),
      color: 'black',
    },
    {
      icon: Search,
      title: t('landingFeature4Title'),
      description: t('landingFeature4Desc'),
      color: 'coral',
      onClick: () => setSearchOpen(true),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-background">
      <SEO
        title={t('landingTitle')}
        description={t('landingSubtitle')}
        url="/"
        jsonLd={organizationSchema}
      />
      
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} publicMode />

      {/* Animated Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-[hsl(14,92%,76%)]/5" />
        
        {/* Floating decorative elements */}
        <div className="absolute top-20 left-[10%] w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute top-40 right-[15%] w-64 h-64 bg-[hsl(14,92%,76%)]/10 rounded-full blur-3xl animate-float-delayed" />
        <div className="absolute bottom-32 left-[20%] w-56 h-56 bg-primary/8 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute bottom-20 right-[25%] w-48 h-48 bg-[hsl(14,92%,76%)]/8 rounded-full blur-3xl animate-float" />
      </div>

      {/* Floating Gamification Icons */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <Trophy className="absolute top-24 left-[8%] w-8 h-8 text-primary/30 animate-float" />
        <Star className="absolute top-32 right-[12%] w-6 h-6 text-[hsl(14,92%,76%)]/40 animate-float-delayed" />
        <Sparkles className="absolute top-48 left-[25%] w-5 h-5 text-primary/25 animate-sparkle" />
        <Award className="absolute bottom-40 right-[8%] w-7 h-7 text-primary/30 animate-float-slow" />
        <Zap className="absolute bottom-32 left-[12%] w-6 h-6 text-[hsl(14,92%,76%)]/35 animate-float-delayed" />
        <Target className="absolute top-64 right-[30%] w-5 h-5 text-primary/20 animate-sparkle" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
          {/* Left: Logo */}
          <div className="flex items-center gap-2">
            <img src={qarayLogo} alt="Qarray" className="w-8 h-8" />
            <span className="font-bold text-lg text-foreground hidden sm:inline">Qarray</span>
          </div>
          
          {/* Right: Auth Buttons + Language */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/login')}
              className="text-sm"
            >
              {t('signIn')}
            </Button>
            <Button 
              size="sm" 
              className="gradient-primary text-sm"
              onClick={() => navigate('/login?signup=true')}
            >
              <Rocket className="w-4 h-4 mr-1" />
              {t('createAccount')}
            </Button>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12 pt-20 relative z-10">
        
        {/* Hero Section */}
        <div className="flex flex-col items-center mb-8 animate-fade-in">
          {/* Welcome Badge */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6 animate-bounce-slow">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Learn Smarter, Not Harder</span>
          </div>

          {/* Logo with glow effect */}
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-glow-pulse" />
            <img
              src={qarayLogo}
              alt="Qarray Logo"
              className="relative w-28 h-28 sm:w-36 sm:h-36 md:w-40 md:h-40 object-contain hover-scale"
            />
          </div>

          {/* Brand Name with Gradient */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground mb-2">
            Qarray
          </h1>

          {/* Achievement Badge */}
          <div className="flex items-center gap-2 mt-2">
            <Trophy className="w-5 h-5 text-[hsl(45,93%,47%)]" />
            <span className="text-sm text-muted-foreground">Educational Platform</span>
            <Trophy className="w-5 h-5 text-[hsl(45,93%,47%)]" />
          </div>
        </div>

        {/* Hero Text */}
        <div className="text-center max-w-2xl mb-8 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t('landingTitle')}
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground mb-6 px-4">
            {t('landingSubtitle')}
          </p>

          {/* Gamified Search Bar */}
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full max-w-md mx-auto flex items-center gap-3 px-4 py-3 mb-6 rounded-full bg-card/80 backdrop-blur-sm border-2 border-border hover:border-primary hover:shadow-lg hover:shadow-primary/10 transition-all group"
          >
            <Search className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">{t('searchPublicContent')}</span>
            <div className="ml-auto flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <Sparkles className="w-3 h-3" />
              Explore
            </div>
          </button>

          {/* Social Proof */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className="flex -space-x-2">
              {[...Array(4)].map((_, i) => (
                <div 
                  key={i} 
                  className="w-8 h-8 rounded-full border-2 border-background flex items-center justify-center text-xs font-bold text-primary-foreground"
                  style={{ 
                    background: i % 2 === 0 ? 'hsl(var(--primary))' : 'hsl(14, 92%, 76%)',
                    zIndex: 4 - i 
                  }}
                >
                  {['🎓', '📚', '⭐', '🏆'][i]}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>
                {studentCount === null 
                  ? 'Join our community' 
                  : studentCount < 10 
                    ? `Join our ${studentCount} students`
                    : `Join ${studentCount.toLocaleString()}+ students`
                }
              </span>
            </div>
          </div>
        </div>

        {/* Statistics Section */}
        <div className="w-full flex justify-center mb-8 animate-slide-up" style={{ animationDelay: '0.3s' }}>
          <StatisticsSection />
        </div>

        {/* Features Section */}
        <div className="w-full max-w-5xl px-4 animate-slide-up" style={{ animationDelay: '0.4s' }}>
          <div className="flex items-center justify-center gap-2 mb-6">
            <Award className="w-5 h-5 text-primary" />
            <h3 className="text-lg sm:text-xl font-bold text-foreground">Key Features</h3>
            <Award className="w-5 h-5 text-primary" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              const isClickable = !!feature.onClick;
              const cardClasses = `gamified-card p-5 sm:p-6 flex flex-col items-center text-center group ${isClickable ? 'cursor-pointer' : ''}`;
              
              const cardContent = (
                <>
                  {/* Icon */}
                  <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${
                    feature.color === 'coral' 
                      ? 'bg-[hsl(14,92%,76%)]/15' 
                      : feature.color === 'black'
                        ? 'bg-gray-900/15 dark:bg-gray-100/15'
                        : 'bg-primary/15'
                  }`}>
                    <IconComponent className={`w-7 h-7 sm:w-8 sm:h-8 ${
                      feature.color === 'coral' 
                        ? 'text-[hsl(14,92%,76%)]' 
                        : feature.color === 'black'
                          ? 'text-gray-900 dark:text-gray-100'
                          : 'text-primary'
                    }`} />
                  </div>

                  {/* Title */}
                  <h4 className="font-semibold text-base sm:text-lg mb-2 text-foreground">{feature.title}</h4>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground flex-1">
                    {feature.description}
                  </p>
                </>
              );

              return isClickable ? (
                <button
                  key={index}
                  onClick={feature.onClick}
                  className={`${cardClasses} relative`}
                >
                  {cardContent}
                </button>
              ) : (
                <div key={index} className={`${cardClasses} relative`}>
                  {cardContent}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center animate-slide-up" style={{ animationDelay: '0.5s' }}>
          <div className="flex items-center justify-center gap-2 mb-4">
            <Star className="w-5 h-5 text-[hsl(45,93%,47%)] animate-sparkle" />
            <span className="text-sm text-muted-foreground">Start your learning journey today</span>
            <Star className="w-5 h-5 text-[hsl(45,93%,47%)] animate-sparkle" style={{ animationDelay: '0.5s' }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;
