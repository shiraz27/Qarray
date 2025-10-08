import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { ActionButtons } from '@/components/ActionButtons';
import { SubjectTabs } from '@/components/SubjectTabs';
import { MainContent } from '@/components/MainContent';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';

const Index: React.FC = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);

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
        </div>
      </div>
    </div>
  );
};

export default Index;
