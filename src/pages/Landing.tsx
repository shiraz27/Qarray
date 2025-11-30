import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import qarayLogo from '@/assets/qarray-logo-new.png';
import educationPattern from '@/assets/education-pattern.png';
import { BookOpen, MessageCircle, Brain, Search } from 'lucide-react';

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-background">
      {/* Animated Background Pattern */}
      <div className="absolute inset-0 -z-10">
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
        <div className="absolute top-20 left-10 w-64 h-64 bg-[#F6A18A]/15 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-40 right-20 w-72 h-72 bg-[hsl(207,89%,54%)]/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-20 left-1/4 w-56 h-56 bg-[#F6A18A]/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-40 right-1/3 w-60 h-60 bg-[hsl(207,89%,54%)]/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '3s' }} />
      </div>

      {/* Language Switcher */}
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10">
        {/* Logo and Brand */}
        <div className="flex flex-col items-center mb-8 animate-fade-in">
          <img
            src={qarayLogo}
            alt="Qarray Logo"
            className="w-32 h-32 md:w-40 md:h-40 object-contain mb-4 hover-scale"
          />
          <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-2">
            Qarray
          </h1>
        </div>

        {/* Hero Section */}
        <div className="text-center max-w-2xl mb-12 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t('landingTitle')}
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground mb-8">
            {t('landingSubtitle')}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => navigate('/login')}
              variant="outline"
              size="lg"
              className="text-lg px-8 py-6 h-auto"
            >
              {t('signIn')}
            </Button>
            <Button
              onClick={() => navigate('/login?signup=true')}
              size="lg"
              className="text-lg px-8 py-6 h-auto bg-primary hover:bg-primary/90"
            >
              {t('createAccount')}
            </Button>
          </div>
        </div>

        {/* Features Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl w-full mt-12 animate-fade-in" style={{ animationDelay: '0.4s' }}>
          {/* Feature 1 */}
          <div className="flex flex-col items-center p-6 rounded-lg bg-background/50 backdrop-blur-sm border border-border hover:border-primary transition-all hover-scale">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">{t('landingFeature1Title')}</h3>
            <p className="text-sm text-muted-foreground text-center">
              {t('landingFeature1Desc')}
            </p>
          </div>

          {/* Feature 2 */}
          <div className="flex flex-col items-center p-6 rounded-lg bg-background/50 backdrop-blur-sm border border-border hover:border-primary transition-all hover-scale">
            <div className="w-16 h-16 rounded-full bg-[#F6A18A]/10 flex items-center justify-center mb-4">
              <MessageCircle className="w-8 h-8 text-[#F6A18A]" />
            </div>
            <h3 className="font-semibold text-lg mb-2">{t('landingFeature2Title')}</h3>
            <p className="text-sm text-muted-foreground text-center">
              {t('landingFeature2Desc')}
            </p>
          </div>

          {/* Feature 3 */}
          <div className="flex flex-col items-center p-6 rounded-lg bg-background/50 backdrop-blur-sm border border-border hover:border-primary transition-all hover-scale">
            <div className="w-16 h-16 rounded-full bg-[hsl(207,89%,54%)]/10 flex items-center justify-center mb-4">
              <Brain className="w-8 h-8 text-[hsl(207,89%,54%)]" />
            </div>
            <h3 className="font-semibold text-lg mb-2">{t('landingFeature3Title')}</h3>
            <p className="text-sm text-muted-foreground text-center">
              {t('landingFeature3Desc')}
            </p>
          </div>

          {/* Feature 4 */}
          <div className="flex flex-col items-center p-6 rounded-lg bg-background/50 backdrop-blur-sm border border-border hover:border-primary transition-all hover-scale">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">{t('landingFeature4Title')}</h3>
            <p className="text-sm text-muted-foreground text-center">
              {t('landingFeature4Desc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;
