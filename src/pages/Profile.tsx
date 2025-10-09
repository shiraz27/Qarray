import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BottomNavigation } from '@/components/BottomNavigation';
import { ArrowLeft, LogOut, Trash2, Edit, Mail, TrendingUp, MessageSquare, ThumbsUp, ThumbsDown, FileText } from 'lucide-react';
import { Session } from '@supabase/supabase-js';
import { EditProfileDialog } from '@/components/EditProfileDialog';
import { Card } from '@/components/ui/card';

export default function Profile() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<{ full_name: string; avatar_color?: string } | null>(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [isDeleting, setIsDeleting] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [stats, setStats] = useState({
    questionsAsked: 0,
    answersGiven: 0,
    resourcesAdded: 0,
    upvotes: 0,
    downvotes: 0,
  });

  const handleTabChange = (tab: string) => {
    if (tab === 'subjects') {
      navigate('/');
    } else if (tab === 'bookmarks') {
      navigate('/bookmarks');
    } else {
      setActiveTab(tab);
    }
  };

  const fetchUserStats = async (userId: string) => {
    try {
      // Count questions
      const { count: questionsCount } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .contains('contributors', [userId])
        .eq('deleted', false);

      // Count answers
      const { count: answersCount } = await supabase
        .from('answers')
        .select('*', { count: 'exact', head: true })
        .contains('contributors', [userId])
        .eq('deleted', false);

      // Count resources
      const { count: resourcesCount } = await supabase
        .from('resources')
        .select('*', { count: 'exact', head: true })
        .eq('published_by', userId)
        .eq('deleted', false);

      // Get all questions by this user to count upvotes/downvotes received
      const { data: userQuestions } = await supabase
        .from('questions')
        .select('id')
        .contains('contributors', [userId])
        .eq('deleted', false);

      const questionIds = userQuestions?.map(q => q.id) || [];

      // Get all answers by this user to count upvotes/downvotes received
      const { data: userAnswers } = await supabase
        .from('answers')
        .select('id')
        .contains('contributors', [userId])
        .eq('deleted', false);

      const answerIds = userAnswers?.map(a => a.id) || [];

      // Count upvotes received on questions
      const { count: questionUpvotes } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .in('content_id', questionIds)
        .eq('content_type', 'question')
        .eq('vote_type', 'upvote');

      // Count downvotes received on questions
      const { count: questionDownvotes } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .in('content_id', questionIds)
        .eq('content_type', 'question')
        .eq('vote_type', 'downvote');

      // Count upvotes received on answers
      const { count: answerUpvotes } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .in('content_id', answerIds)
        .eq('content_type', 'answer')
        .eq('vote_type', 'upvote');

      // Count downvotes received on answers
      const { count: answerDownvotes } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .in('content_id', answerIds)
        .eq('content_type', 'answer')
        .eq('vote_type', 'downvote');

      setStats({
        questionsAsked: questionsCount || 0,
        answersGiven: answersCount || 0,
        resourcesAdded: resourcesCount || 0,
        upvotes: (questionUpvotes || 0) + (answerUpvotes || 0),
        downvotes: (questionDownvotes || 0) + (answerDownvotes || 0),
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, avatar_color')
      .eq('user_id', userId)
      .single();
    
    if (data) setUserProfile(data);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
        fetchUserStats(session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
        fetchUserStats(session.user.id);
      }
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

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.map(p => p[0]).join('').toUpperCase().substring(0, 2);
  };

  const avatarColorClass = userProfile?.avatar_color || 'gradient-primary';

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-lg font-semibold flex-1">{t('profile') || 'Profile'}</h1>
      </div>

      <div className="flex flex-col items-center justify-start p-4 md:p-8 space-y-6">
        <div className="w-full max-w-2xl space-y-6">
          {/* Profile Card */}
          <Card className="gamified-card p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className={`w-20 h-20 bg-gradient-to-br ${avatarColorClass} rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg`}>
                  {userProfile?.full_name ? getInitials(userProfile.full_name) : '👤'}
                </div>
                <div>
                  <h3 className="font-bold text-xl">{userProfile?.full_name || 'User'}</h3>
                  <p className="text-sm text-muted-foreground">{session?.user?.email}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setEditDialogOpen(true)}
                className="hover-scale"
              >
                <Edit className="h-4 w-4" />
              </Button>
            </div>
          </Card>

          {/* Statistics Card */}
          <Card className="gamified-card p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Your Statistics
            </h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-gradient-primary text-white hover-glow text-center">
                <MessageSquare className="w-5 h-5 mx-auto mb-1" />
                <p className="text-2xl font-bold">{stats.questionsAsked}</p>
                <span className="text-xs">Questions</span>
              </div>
              <div className="p-3 rounded-lg bg-gradient-secondary text-white hover-glow text-center">
                <MessageSquare className="w-5 h-5 mx-auto mb-1" />
                <p className="text-2xl font-bold">{stats.answersGiven}</p>
                <span className="text-xs">Answers</span>
              </div>
              <div className="p-3 rounded-lg bg-purple-500 text-white hover-glow text-center">
                <FileText className="w-5 h-5 mx-auto mb-1" />
                <p className="text-2xl font-bold">{stats.resourcesAdded}</p>
                <span className="text-xs">Resources</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-green-500 text-white hover-glow">
                <div className="flex items-center gap-2 mb-2">
                  <ThumbsUp className="w-5 h-5" />
                  <span className="text-sm font-medium">Upvotes Received</span>
                </div>
                <p className="text-3xl font-bold">{stats.upvotes}</p>
              </div>
              <div className="p-4 rounded-lg bg-red-500 text-white hover-glow">
                <div className="flex items-center gap-2 mb-2">
                  <ThumbsDown className="w-5 h-5" />
                  <span className="text-sm font-medium">Downvotes Received</span>
                </div>
                <p className="text-3xl font-bold">{stats.downvotes}</p>
              </div>
            </div>
          </Card>

          {/* Contact Card */}
          <Card className="gamified-card p-6 space-y-3">
            <h3 className="font-bold text-lg mb-4">Contact & Support</h3>
            <Button
              variant="outline"
              className="w-full justify-start hover-scale"
              onClick={() => window.location.href = 'mailto:support@qarray.com?subject=Support Request'}
            >
              <Mail className="mr-2 h-4 w-4" />
              Contact Support
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start hover-scale"
              onClick={() => window.location.href = 'mailto:shiraz@code-craft-studios.com?subject=Developer Contact'}
            >
              <Mail className="mr-2 h-4 w-4" />
              Contact Developer
            </Button>
          </Card>

          {/* Actions Card */}
          <Card className="gamified-card p-6 space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start hover-scale"
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
          </Card>
        </div>
      </div>

      <EditProfileDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        currentFirstName={userProfile?.full_name.split(' ')[0] || ''}
        currentLastName={userProfile?.full_name.split(' ').slice(1).join(' ') || ''}
        currentAvatarColor={userProfile?.avatar_color || 'gradient-primary'}
        userId={session?.user?.id || ''}
        onUpdate={() => {
          if (session) {
            fetchUserProfile(session.user.id);
          }
        }}
      />

      <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
    </div>
  );
}
