import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';

interface UserAvatarProps {
  userId: string;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
  showDate?: boolean;
  date?: string;
}

interface Profile {
  full_name: string | null;
}

export function UserAvatar({ userId, size = 'md', showName = false, showDate = false, date }: UserAvatarProps) {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', userId)
        .single();

      if (data) {
        setProfile(data);
      }
    };

    fetchProfile();
  }, [userId]);

  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (showName || showDate) {
    return (
      <div className="flex items-center gap-2">
        <Avatar className={sizeClasses[size]}>
          <AvatarImage src="" alt={profile?.full_name || 'User'} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {profile ? getInitials(profile.full_name) : <User size={size === 'sm' ? 12 : size === 'md' ? 14 : 16} />}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          {showName && (
            <span className="text-sm font-medium">
              {profile?.full_name || 'Anonymous'}
            </span>
          )}
          {showDate && date && (
            <span className="text-xs text-muted-foreground">
              {formatDate(date)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <Avatar className={sizeClasses[size]}>
      <AvatarImage src="" alt={profile?.full_name || 'User'} />
      <AvatarFallback className="bg-primary/10 text-primary">
        {profile ? getInitials(profile.full_name) : <User size={size === 'sm' ? 12 : size === 'md' ? 14 : 16} />}
      </AvatarFallback>
    </Avatar>
  );
}
