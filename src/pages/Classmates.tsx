import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Trophy, Users, School, ArrowLeft, ThumbsUp, ThumbsDown } from 'lucide-react';
import { ContentSkeleton } from '@/components/LoadingSkeleton';
import { BottomNavigation } from '@/components/BottomNavigation';
import { Button } from '@/components/ui/button';
import qarayLogo from '@/assets/qarray-logo-new.png';

interface StudentStat {
  user_id: string;
  full_name: string;
  avatar_color: string;
  institute_id: string | null;
  questions_count: number;
  answers_count: number;
  resources_count: number;
  memorizations_count: number;
  upvotes: number;
  downvotes: number;
  total_score: number;
}

export default function Classmates() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [classmates, setClassmates] = useState<StudentStat[]>([]);
  const [schoolmates, setSchoolmates] = useState<StudentStat[]>([]);
  const [currentUserClassId, setCurrentUserClassId] = useState<number | null>(null);
  const [currentUserInstituteId, setCurrentUserInstituteId] = useState<string | null>(null);
  const [activeTab] = useState('classmates');

  const handleTabChange = (tab: string) => {
    if (tab === 'subjects') {
      navigate('/');
    } else if (tab === 'bookmarks') {
      navigate('/bookmarks');
    } else if (tab === 'profile') {
      navigate('/profile');
    }
    // Stay on classmates page if tab === 'classmates'
  };

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }
      fetchClassmates(user.id);
    };

    checkAuth();
  }, [navigate]);

  const fetchClassmates = async (userId: string) => {
    try {
      // Get current user's profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('class_id, institute_id')
        .eq('user_id', userId)
        .single();

      if (!profile?.class_id) {
        setLoading(false);
        return;
      }

      setCurrentUserClassId(profile.class_id);
      setCurrentUserInstituteId(profile.institute_id);

      // Get all classmates with their stats
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_color, institute_id, class_id')
        .eq('class_id', profile.class_id)
        .neq('user_id', userId)
        .eq('deleted', false);

      if (!profiles) {
        setLoading(false);
        return;
      }

      // Calculate stats for each user
      const statsPromises = profiles.map(async (p) => {
        // Count questions
        const { count: questionsCount } = await supabase
          .from('questions')
          .select('*', { count: 'exact', head: true })
          .contains('contributors', [p.user_id])
          .eq('deleted', false);

        // Count answers
        const { count: answersCount } = await supabase
          .from('answers')
          .select('*', { count: 'exact', head: true })
          .contains('contributors', [p.user_id])
          .eq('deleted', false);

        // Count resources
        const { count: resourcesCount } = await supabase
          .from('resources')
          .select('*', { count: 'exact', head: true })
          .eq('published_by', p.user_id)
          .eq('deleted', false);

        // Count memorizations (created + subscribed)
        const { count: createdMemorizations } = await supabase
          .from('memorizations')
          .select('*', { count: 'exact', head: true })
          .eq('creator_id', p.user_id)
          .eq('deleted', false);

        const { count: subscribedMemorizations } = await supabase
          .from('memorization_subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', p.user_id);

        // Get flashcard review stats (quality scores)
        const { data: reviewData } = await supabase
          .from('flashcard_reviews')
          .select('quality, review_count, memorization_id')
          .eq('user_id', p.user_id);

        // Count upvotes and downvotes
        const { count: upvotesCount } = await supabase
          .from('votes')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', p.user_id)
          .eq('vote_type', 'up');

        const { count: downvotesCount } = await supabase
          .from('votes')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', p.user_id)
          .eq('vote_type', 'down');

      const questions = questionsCount || 0;
      const answers = answersCount || 0;
      const resources = resourcesCount || 0;
      const totalMemorizations = (createdMemorizations || 0) + (subscribedMemorizations || 0);
      const upvotes = upvotesCount || 0;
      const downvotes = downvotesCount || 0;

      // Calculate memorization performance score
      let memorizationScore = 0;
      if (reviewData && reviewData.length > 0) {
        // Get average quality across all reviews
        const totalQuality = reviewData.reduce((sum, review) => sum + review.quality, 0);
        const avgQuality = totalQuality / reviewData.length;
        
        // Get unique memorizations studied
        const uniqueMemorizations = new Set(reviewData.map(r => r.memorization_id)).size;
        
        // Score = (memorization count × 10) + (avg quality × 20) + (unique studied × 5)
        memorizationScore = (totalMemorizations * 10) + (avgQuality * 20) + (uniqueMemorizations * 5);
      } else {
        // If no reviews, just count memorizations
        memorizationScore = totalMemorizations * 5;
      }

      // Calculate total score: base contributions + upvotes - downvotes + memorization score
      const totalScore = questions + answers + resources + upvotes - downvotes + Math.round(memorizationScore);

        return {
          user_id: p.user_id,
          full_name: p.full_name,
          avatar_color: p.avatar_color || 'gradient-primary',
          institute_id: p.institute_id,
          questions_count: questions,
          answers_count: answers,
          resources_count: resources,
          memorizations_count: totalMemorizations,
          upvotes: upvotes,
          downvotes: downvotes,
          total_score: totalScore,
        };
      });

      const stats = await Promise.all(statsPromises);
      
      // Sort by total score
      const sortedStats = stats.sort((a, b) => b.total_score - a.total_score);

      // Separate by school
      const sameSchool = sortedStats.filter(s => s.institute_id && s.institute_id === profile.institute_id);
      const allClassmates = sortedStats;

      setSchoolmates(sameSchool);
      setClassmates(allClassmates);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching classmates:', error);
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const renderStudentCard = (student: StudentStat, rank: number) => (
    <Card key={student.user_id} className="p-4 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all bg-card">
      <div className="flex items-center gap-3">
        {/* Rank Badge */}
        <div className="flex-shrink-0">
          {rank <= 3 ? (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-lg ${
              rank === 1 ? 'bg-gradient-to-br from-[#F6A18A] to-[#e08870]' : rank === 2 ? 'bg-gradient-to-br from-gray-300 to-gray-500' : 'bg-gradient-to-br from-orange-400 to-orange-600'
            }`}>
              {rank === 1 && <Trophy className="w-4 h-4" />}
              {rank !== 1 && <span className="text-sm">{rank}</span>}
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-semibold bg-muted text-muted-foreground text-sm">
              {rank}
            </div>
          )}
        </div>

        {/* Avatar */}
        <Avatar className={`w-10 h-10 ${student.avatar_color}`}>
          <AvatarFallback className="bg-transparent text-white font-semibold text-sm">
            {getInitials(student.full_name)}
          </AvatarFallback>
        </Avatar>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate text-sm">{student.full_name}</h3>
          <div className="flex flex-wrap gap-1 mt-1">
            <span className="text-xs px-1.5 py-0 border border-border rounded-md bg-card">
              📝 {student.questions_count}
            </span>
            <span className="text-xs px-1.5 py-0 border border-border rounded-md bg-card">
              💡 {student.answers_count}
            </span>
            <span className="text-xs px-1.5 py-0 border border-border rounded-md bg-card">
              📚 {student.resources_count}
            </span>
            <span className="text-xs px-1.5 py-0 border border-border rounded-md bg-card">
              🧠 {student.memorizations_count}
            </span>
          </div>
          <div className="flex gap-2 mt-1">
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <ThumbsUp className="w-3 h-3 text-green-500" /> {student.upvotes}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <ThumbsDown className="w-3 h-3 text-red-500" /> {student.downvotes}
            </span>
          </div>
        </div>

        {/* Total Score */}
        <div className="flex-shrink-0 text-right">
          <div className="text-xl font-bold bg-gradient-to-r from-[#F6A18A] to-primary bg-clip-text text-transparent">{student.total_score}</div>
          <div className="text-[10px] text-muted-foreground">points</div>
        </div>
      </div>
    </Card>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <ContentSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navigation */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="hover-scale">
            <ArrowLeft size={20} />
          </Button>
          <div className="flex items-center gap-2">
            <img src={qarayLogo} alt="Qarray Logo" className="h-12 w-12 object-contain" />
            <span className="text-xl font-bold text-foreground">Qarray</span>
          </div>
          <div className="w-10" />
        </div>
      </div>

      <main className="flex-1 w-full px-4 pb-4 mb-24 mt-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Classmates</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Same School Section */}
          {schoolmates.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <School size={20} style={{ color: '#F6A18A' }} />
                Same School ({schoolmates.length})
              </h2>
              <div className="space-y-2">
                {schoolmates.map((student, idx) => renderStudentCard(student, idx + 1))}
              </div>
            </div>
          )}

          {/* All Classmates Section */}
          {classmates.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Trophy size={20} className="text-primary" />
                All Classmates ({classmates.length})
              </h2>
              <div className="space-y-2">
                {classmates.map((student, idx) => renderStudentCard(student, idx + 1))}
              </div>
            </div>
          )}

          {classmates.length === 0 && (
            <div className="col-span-full text-center py-12">
              <Users className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No classmates found yet</p>
            </div>
          )}
        </div>
      </main>

      <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
    </div>
  );
}
