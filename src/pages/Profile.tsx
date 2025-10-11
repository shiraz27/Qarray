import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BottomNavigation } from '@/components/BottomNavigation';
import { ArrowLeft, LogOut, Trash2, Edit, Mail, TrendingUp, MessageSquare, ThumbsUp, ThumbsDown, FileText, Palette, Upload, X, GraduationCap, Bell, BookOpen } from 'lucide-react';
import { Session } from '@supabase/supabase-js';
import { EditProfileDialog } from '@/components/EditProfileDialog';
import { TutorialDialog } from '@/components/TutorialDialog';
import { Card } from '@/components/ui/card';
import { useUserRole } from '@/hooks/useUserRole';

export default function Profile() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isModerator, isAdmin } = useUserRole();
  const [session, setSession] = useState<Session | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<{
    full_name: string; 
    avatar_color?: string;
    phone_number?: string;
    state_id?: number;
    class_id?: number;
    institute_id?: string;
    theme?: string;
    user_type?: string;
    teacher_verified?: boolean;
    teacher_documents?: string[];
    teacher_verification_status?: string;
  } | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
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
      .select('full_name, avatar_color, phone_number, state_id, class_id, institute_id, theme, user_type, teacher_verified, teacher_documents, teacher_verification_status')
      .eq('user_id', userId)
      .single();
    
    if (data) setUserProfile(data);
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are allowed');
      return;
    }

    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileName', file.name);
      formData.append('fileType', 'pdf');
      formData.append('chapterId', '1');
      formData.append('contentType', 'teacher-verification');

      const { data, error } = await supabase.functions.invoke('upload-to-archive', {
        body: formData,
      });

      if (error) throw error;

      const updatedDocs = [...(userProfile?.teacher_documents || []), data.url];
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          teacher_documents: updatedDocs,
          teacher_verification_status: 'pending'
        })
        .eq('user_id', session?.user?.id);

      if (updateError) throw updateError;

      toast.success('Document uploaded successfully');
      if (session) fetchUserProfile(session.user.id);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Failed to upload document');
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const removeDocument = async (index: number) => {
    if (!session?.user?.id) return;
    
    const updatedDocs = userProfile?.teacher_documents?.filter((_, i) => i !== index) || [];
    
    const { error } = await supabase
      .from('profiles')
      .update({ teacher_documents: updatedDocs })
      .eq('user_id', session.user.id);

    if (error) {
      toast.error('Failed to remove document');
      return;
    }

    toast.success('Document removed');
    fetchUserProfile(session.user.id);
  };

  const createTestNotification = async () => {
    if (!session?.user?.id) return;
    
    try {
      const { error } = await supabase
        .from('notifications')
        .insert({
          user_id: session.user.id,
          type: 'flashcard_review',
          title: 'Flashcards Due for Review (TEST)',
          message: 'You have 5 flashcards due for review across 2 memorizations',
          reference_type: 'flashcard',
          reference_id: null
        });

      if (error) throw error;
      
      toast.success('Test notification created!');
    } catch (error: any) {
      console.error('Error creating test notification:', error);
      toast.error('Failed to create test notification');
    }
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

  const avatarColorClass = userProfile?.avatar_color?.startsWith('#') 
    ? '' 
    : userProfile?.avatar_color || 'gradient-primary';
  const avatarColorStyle = userProfile?.avatar_color?.startsWith('#')
    ? { backgroundColor: userProfile.avatar_color }
    : undefined;

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
                <div 
                  className={`w-20 h-20 ${avatarColorClass ? `bg-gradient-to-br ${avatarColorClass}` : ''} rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg`}
                  style={avatarColorStyle}
                >
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
              <div className="p-3 rounded-lg gradient-primary text-white hover-glow text-center shadow-lg">
                <MessageSquare className="w-5 h-5 mx-auto mb-1" />
                <p className="text-2xl font-bold">{stats.questionsAsked}</p>
                <span className="text-xs">Questions</span>
              </div>
              <div className="p-3 rounded-lg gradient-secondary text-white hover-glow text-center shadow-lg">
                <MessageSquare className="w-5 h-5 mx-auto mb-1" />
                <p className="text-2xl font-bold">{stats.answersGiven}</p>
                <span className="text-xs">Answers</span>
              </div>
              <div className="p-3 rounded-lg gradient-accent text-white hover-glow text-center shadow-lg">
                <FileText className="w-5 h-5 mx-auto mb-1" />
                <p className="text-2xl font-bold">{stats.resourcesAdded}</p>
                <span className="text-xs">Resources</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-green-500 text-white hover-glow shadow-lg">
                <div className="flex items-center gap-2 mb-2">
                  <ThumbsUp className="w-5 h-5" />
                  <span className="text-sm font-medium">Upvotes Received</span>
                </div>
                <p className="text-3xl font-bold">{stats.upvotes}</p>
              </div>
              <div className="p-4 rounded-lg bg-red-500 text-white hover-glow shadow-lg">
                <div className="flex items-center gap-2 mb-2">
                  <ThumbsDown className="w-5 h-5" />
                  <span className="text-sm font-medium">Downvotes Received</span>
                </div>
                <p className="text-3xl font-bold">{stats.downvotes}</p>
              </div>
            </div>
          </Card>

          {/* Teacher Documents Card - Only show for teachers */}
          {userProfile?.user_type === 'teacher' && (
            <Card className="gamified-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-primary" />
                  Teacher Verification
                </h3>
                {userProfile.teacher_verified ? (
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    Verified
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                    {userProfile.teacher_verification_status || 'Pending'}
                  </span>
                )}
              </div>
              
              <p className="text-sm text-muted-foreground mb-4">
                Upload your teaching certification, degree, or professional ID to get verified
              </p>

              <Button
                variant="outline"
                onClick={() => document.getElementById('teacherDocInput')?.click()}
                disabled={uploadingDoc}
                className="w-full mb-4"
              >
                {uploadingDoc ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Document
                  </>
                )}
              </Button>
              <input
                id="teacherDocInput"
                type="file"
                accept="application/pdf"
                onChange={handleDocumentUpload}
                className="hidden"
              />

              {userProfile.teacher_documents && userProfile.teacher_documents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Uploaded Documents:</p>
                  {userProfile.teacher_documents.map((doc, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <a 
                        href={doc} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex-1 truncate"
                      >
                        Document {index + 1}
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDocument(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Test Notifications Card - For moderators only */}
          {(isModerator || isAdmin) && (
            <Card className="gamified-card p-6 space-y-3">
              <h3 className="font-bold text-lg mb-4">Testing</h3>
              <Button
                variant="outline"
                className="w-full justify-start hover-scale"
                onClick={createTestNotification}
              >
                <Bell className="mr-2 h-4 w-4" />
                Create Test Flashcard Notification
              </Button>
            </Card>
          )}

          {/* Contact Card */}
          <Card className="gamified-card p-6 space-y-3">
            <h3 className="font-bold text-lg mb-4">Tutorial & Support</h3>
            <Button
              variant="outline"
              className="w-full justify-start hover-scale"
              onClick={() => setTutorialOpen(true)}
            >
              <BookOpen className="mr-2 h-4 w-4" />
              {t('viewTutorial') || 'View Tutorial'}
            </Button>
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
        currentEmail={session?.user?.email || ''}
        currentPhoneNumber={userProfile?.phone_number || ''}
        currentStateId={userProfile?.state_id || null}
        currentClassId={userProfile?.class_id || null}
        currentInstituteId={userProfile?.institute_id || null}
        userId={session?.user?.id || ''}
        onUpdate={() => {
          if (session) {
            fetchUserProfile(session.user.id);
          }
        }}
      />

      <TutorialDialog open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
      <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
    </div>
  );
}
