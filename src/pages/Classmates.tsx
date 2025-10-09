import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
  const [activeTab, setActiveTab] = useState('classmates');

  const handleTabChange = (tab: string) => {
    if (tab === 'subjects') {
      navigate('/');
    } else if (tab === 'bookmarks') {
      navigate('/bookmarks');
    } else if (tab === 'profile') {
      navigate('/profile');
    } else {
      setActiveTab(tab);
    }
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
        const upvotes = upvotesCount || 0;
        const downvotes = downvotesCount || 0;

        // Calculate total score: contributions + upvotes - downvotes
        const totalScore = questions + answers + resources + upvotes - downvotes;

        return {
          user_id: p.user_id,
          full_name: p.full_name,
          avatar_color: p.avatar_color || 'gradient-primary',
          institute_id: p.institute_id,
          questions_count: questions,
          answers_count: answers,
          resources_count: resources,
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
    <Card key={student.user_id} className="p-3 hover-scale transition-all bg-card/50 backdrop-blur-sm border-border/50">
      <div className="flex items-center gap-3">
        {/* Rank Badge */}
        <div className="flex-shrink-0">
          {rank <= 3 ? (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-lg ${
              rank === 1 ? 'gradient-primary' : rank === 2 ? 'bg-gradient-to-br from-gray-300 to-gray-500' : 'bg-gradient-to-br from-orange-400 to-orange-600'
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
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              📝 {student.questions_count}
            </Badge>
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              💡 {student.answers_count}
            </Badge>
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              📚 {student.resources_count}
            </Badge>
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
          <div className="text-xl font-bold gradient-text">{student.total_score}</div>
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
    <div className="min-h-screen bg-background pb-24 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border p-4 flex items-center gap-3 sticky top-0 z-10 backdrop-blur-sm bg-card/95">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          className="hover-scale"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <img
          src={qarayLogo}
          className="h-10 w-10 object-contain"
          alt="Qarray Logo"
        />
        <div className="flex-1">
          <h1 className="text-xl font-bold gradient-text flex items-center gap-2">
            <Users className="w-5 h-5" />
            Classmates
          </h1>
          <p className="text-xs text-muted-foreground">Top contributors</p>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
          {/* Same School Section */}
          {schoolmates.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur-sm py-2 z-5">
                <School className="w-4 h-4 text-primary" />
                <h2 className="text-base font-bold text-foreground">Same School</h2>
                <Badge variant="secondary" className="text-xs">{schoolmates.length}</Badge>
              </div>
              <div className="space-y-2">
                {schoolmates.map((student, idx) => renderStudentCard(student, idx + 1))}
              </div>
            </div>
          )}

          {/* All Classmates Section */}
          {classmates.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 sticky top-0 bg-background/95 backdrop-blur-sm py-2 z-5">
                <Trophy className="w-4 h-4 text-primary" />
                <h2 className="text-base font-bold text-foreground">All Classmates</h2>
                <Badge variant="secondary" className="text-xs">{classmates.length}</Badge>
              </div>
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
      </div>

      <BottomNavigation onTabChange={handleTabChange} activeTab={activeTab} />
    </div>
  );
}
