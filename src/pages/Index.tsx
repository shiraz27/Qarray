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
import { LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Index: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState('subjects');

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({
        title: "Logged out",
        description: "You've been successfully logged out.",
      });
      navigate('/login');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (!session) {
          navigate('/login');
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="w-full mx-auto flex flex-col min-h-screen">
        <div className="flex-1 w-full overflow-auto">
          {activeTab === 'subjects' && (
            <>
              <section className="items-stretch flex w-full flex-col bg-white">
                <Header userName="Osman" />
                
                <div className="flex justify-center mt-4">
                  <img
                    src="https://api.builder.io/api/v1/image/assets/a6410069d4c34ccabf25d52a6064b0e1/690fbf551718dd4374bdf3773c038c355abbe5a5?placeholderIfAbsent=true"
                    className="aspect-[0.83] object-contain w-[57px]"
                    alt="Educational mascot logo"
                  />
                </div>
                
                <ActionButtons />
              </section>
              
              <SubjectTabs />
              <MainContent />
            </>
          )}

          {activeTab === 'bookmarks' && (
            <div className="flex flex-col items-center justify-center h-full p-8">
              <h2 className="text-2xl font-bold mb-4">Bookmarks</h2>
              <p className="text-gray-600">Your saved bookmarks will appear here</p>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="flex flex-col items-center justify-start h-full p-8">
              <div className="w-full max-w-md space-y-6">
                <h2 className="text-2xl font-bold mb-6">Profile</h2>
                
                <div className="bg-white rounded-lg border p-6 space-y-4">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center text-2xl">
                      👤
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Osman</h3>
                      <p className="text-sm text-gray-600">{session?.user?.email}</p>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-sm font-medium mb-3 text-gray-700">Language</p>
                    <LanguageSwitcher />
                  </div>

                  <Button
                    onClick={handleLogout}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <LogOut size={18} />
                    Logout
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <BottomNavigation onTabChange={setActiveTab} activeTab={activeTab} />
      </div>
    </div>
  );
};

export default Index;
