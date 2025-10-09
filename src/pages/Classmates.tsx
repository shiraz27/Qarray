import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Trophy, Users, School, TrendingUp } from 'lucide-react';
import { ContentSkeleton } from '@/components/LoadingSkeleton';

interface StudentStat {
  user_id: string;
  full_name: string;
  avatar_color: string;
  institute_id: string | null;
  questions_count: number;
  answers_count: number;
  resources_count: number;
  total_contributions: number;
}

export default function Classmates() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [classmates, setClassmates] = useState<StudentStat[]>([]);
  const [schoolmates, setSchoolmates] = useState<StudentStat[]>([]);
  const [currentUserClassId, setCurrentUserClassId] = useState<number | null>(null);
  const [currentUserInstituteId, setCurrentUserInstituteId] = useState<string | null>(null);

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

        return {
          user_id: p.user_id,
          full_name: p.full_name,
          avatar_color: p.avatar_color || 'gradient-primary',
          institute_id: p.institute_id,
          questions_count: questionsCount || 0,
          answers_count: answersCount || 0,
          resources_count: resourcesCount || 0,
          total_contributions: (questionsCount || 0) + (answersCount || 0) + (resourcesCount || 0),
        };
      });

      const stats = await Promise.all(statsPromises);
      
      // Sort by total contributions
      const sortedStats = stats.sort((a, b) => b.total_contributions - a.total_contributions);

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
    <Card key={student.user_id} className="p-4 hover-scale transition-all">
      <div className="flex items-center gap-4">
        {/* Rank Badge */}
        <div className="flex-shrink-0">
          {rank <= 3 ? (
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
              rank === 1 ? 'bg-yellow-500' : rank === 2 ? 'bg-gray-400' : 'bg-orange-600'
            }`}>
              {rank === 1 && <Trophy className="w-5 h-5" />}
              {rank !== 1 && rank}
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold bg-muted text-muted-foreground">
              {rank}
            </div>
          )}
        </div>

        {/* Avatar */}
        <Avatar className={`w-12 h-12 ${student.avatar_color}`}>
          <AvatarFallback className="bg-transparent text-white font-semibold">
            {getInitials(student.full_name)}
          </AvatarFallback>
        </Avatar>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">{student.full_name}</h3>
          <div className="flex flex-wrap gap-2 mt-1">
            <Badge variant="outline" className="text-xs">
              📝 {student.questions_count} Q
            </Badge>
            <Badge variant="outline" className="text-xs">
              💡 {student.answers_count} A
            </Badge>
            <Badge variant="outline" className="text-xs">
              📚 {student.resources_count} R
            </Badge>
          </div>
        </div>

        {/* Total Score */}
        <div className="flex-shrink-0 text-right">
          <div className="text-2xl font-bold gradient-text">{student.total_contributions}</div>
          <div className="text-xs text-muted-foreground">points</div>
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
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/10 to-accent/10 p-6 border-b">
        <h1 className="text-3xl font-bold gradient-text flex items-center gap-2">
          <Users className="w-8 h-8" />
          Classmates
        </h1>
        <p className="text-muted-foreground mt-2">Top contributors in your class</p>
      </div>

      <div className="p-4 space-y-6">
        {/* Same School Section */}
        {schoolmates.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <School className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">Same School & Class</h2>
              <Badge variant="secondary">{schoolmates.length}</Badge>
            </div>
            <div className="space-y-3">
              {schoolmates.map((student, idx) => renderStudentCard(student, idx + 1))}
            </div>
          </div>
        )}

        {schoolmates.length > 0 && classmates.length > 0 && (
          <Separator className="my-6" />
        )}

        {/* All Classmates Section */}
        {classmates.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">All Classmates</h2>
              <Badge variant="secondary">{classmates.length}</Badge>
            </div>
            <div className="space-y-3">
              {classmates.map((student, idx) => renderStudentCard(student, idx + 1))}
            </div>
          </div>
        )}

        {classmates.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No classmates found yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
