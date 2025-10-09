import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { ActionButtons } from '@/components/ActionButtons';
import { SubjectTabs } from '@/components/SubjectTabs';
import { MainContent } from '@/components/MainContent';
import { BottomNavigation } from '@/components/BottomNavigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { LogOut, Trash2, Search } from 'lucide-react';
import { GlobalSearch } from '@/components/GlobalSearch';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import qarayLogo from '@/assets/qarray-logo-new.png';
import educationPattern from '@/assets/education-pattern.png';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const Index: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState('subjects');
  const [isDeleting, setIsDeleting] = useState(false);
  const [userProfile, setUserProfile] = useState<{ full_name: string; class_id: number } | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

   const handleTabChange = (tab: string) => {
    if (tab === 'bookmarks') {
      navigate('/bookmarks');
    } else if (tab === 'classmates') {
      navigate('/classmates');
    } else {
      setActiveTab(tab);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({
        title: t('logout'),
        description: "You've been successfully logged out.",
      });
      navigate('/login');
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete account');
      }

      toast({
        title: t('accountDeleted'),
        description: "You can now register again with the same email.",
      });
      
      navigate('/login');
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (!session) {
          navigate('/login');
        } else {
          // Check if profile is complete and fetch user data
          setTimeout(async () => {
            const { data: profile } = await supabase
              .from('profiles')
              .select('phone_number, state_id, class_id, full_name')
              .eq('user_id', session.user.id)
              .single();
            
            if (!profile || !profile.phone_number || !profile.state_id || !profile.class_id) {
              navigate('/complete-profile');
            } else {
              setUserProfile({ full_name: profile.full_name, class_id: profile.class_id });
            }
          }, 0);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate('/login');
      } else {
        // Check if profile is complete and fetch user data
        setTimeout(async () => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('phone_number, state_id, class_id, full_name')
            .eq('user_id', session.user.id)
            .single();
          
          if (!profile || !profile.phone_number || !profile.state_id || !profile.class_id) {
            navigate('/complete-profile');
          } else {
            setUserProfile({ full_name: profile.full_name, class_id: profile.class_id });
          }
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      <div className="w-full mx-auto flex flex-col min-h-screen">
        <div className="flex-1 w-full overflow-auto pb-24">
          {activeTab === 'subjects' && (
            <>
              {/* Animated Background Pattern */}
              <div className="absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#F6A18A]/15 via-background to-[hsl(207,89%,54%)]/15" />
                
                {/* Education pattern background */}
                <div 
                  className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage: `url(${educationPattern})`,
                    backgroundSize: '400px 400px',
                    backgroundRepeat: 'repeat',
                    backgroundPosition: 'center'
                  }}
                />
                
                {/* Geometric shapes for e-learning theme */}
                <div className="absolute top-20 left-10 w-48 h-48 bg-[#F6A18A]/25 rounded-full blur-3xl animate-pulse" />
                <div className="absolute top-40 right-20 w-56 h-56 bg-[hsl(207,89%,54%)]/25 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
                <div className="absolute top-96 left-1/4 w-52 h-52 bg-[#F6A18A]/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
                <div className="absolute top-[600px] right-1/3 w-48 h-48 bg-[hsl(207,89%,54%)]/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '3s' }} />
              </div>

              <section className="items-stretch flex w-full flex-col bg-background/90 backdrop-blur-sm relative z-10">
                <Header userName={userProfile?.full_name || 'User'} />
                
                <div className="flex flex-col items-center mt-6 mb-4 gap-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={qarayLogo}
                      className="h-16 w-16 object-contain hover-scale"
                      alt="Qarray Logo"
                    />
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
              <MainContent subjectId={selectedSubject} />
            </>
          )}

          {activeTab === 'profile' && (
            <div className="flex flex-col items-center justify-start h-full p-8">
              <div className="w-full max-w-md space-y-6">
                <h2 className="text-2xl font-bold mb-6">{t('profile')}</h2>
                
                <div className="bg-white rounded-lg border p-6 space-y-4">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center text-2xl">
                      👤
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{userProfile?.full_name || 'User'}</h3>
                      <p className="text-sm text-gray-600">{session?.user?.email}</p>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-sm font-medium mb-3 text-gray-700">{t('language')}</p>
                    <LanguageSwitcher />
                  </div>

                  <Button
                    onClick={handleLogout}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <LogOut size={18} />
                    {t('logout')}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        className="w-full gap-2"
                      >
                        <Trash2 size={18} />
                        {t('deleteAccount')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('deleteAccount')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('deleteAccountConfirm')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteAccount}
                          disabled={isDeleting}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {isDeleting ? 'Deleting...' : t('delete')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
      </div>
      
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
};

export default Index;
