import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BottomNavigation } from '@/components/BottomNavigation';
import { ArrowLeft, LogOut, Trash2 } from 'lucide-react';
import { Session } from '@supabase/supabase-js';

export default function Profile() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<{ full_name: string } | null>(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleTabChange = (tab: string) => {
    if (tab === 'subjects') {
      navigate('/');
    } else if (tab === 'bookmarks') {
      navigate('/bookmarks');
    } else {
      setActiveTab(tab);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', session.user.id)
          .single()
          .then(({ data }) => {
            if (data) setUserProfile(data);
          });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success(t('signedOut') || 'Signed out successfully');
    navigate('/login');
  };

  const handleDeleteAccount = async () => {
    if (!session?.user) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-user');
      
      if (error) throw error;
      
      await supabase.auth.signOut();
      toast.success(t('accountDeleted') || 'Account deleted successfully');
      navigate('/login');
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error(t('deleteAccountError') || 'Failed to delete account');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-lg font-semibold flex-1">{t('profile') || 'Profile'}</h1>
      </div>

      <div className="flex flex-col items-center justify-start h-full p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="bg-white rounded-lg border p-6 space-y-4">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-2xl">
                👤
              </div>
              <div>
                <h3 className="font-semibold text-lg">{userProfile?.full_name || 'User'}</h3>
                <p className="text-sm text-gray-600">{session?.user?.email}</p>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t('signOut') || 'Sign Out'}
            </Button>

            <Button
              variant="destructive"
              className="w-full justify-start"
              onClick={handleDeleteAccount}
              disabled={isDeleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeleting ? (t('deleting') || 'Deleting...') : (t('deleteAccount') || 'Delete Account')}
            </Button>
          </div>
        </div>
      </div>

      <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
    </div>
  );
}
