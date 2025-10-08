import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';

const gradients = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
  'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  'linear-gradient(135deg, #ff6a00 0%, #ee0979 100%)',
  'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)',
  'linear-gradient(135deg, #00d2ff 0%, #3a47d5 100%)',
];

const getGradientForUser = (userId: string): string => {
  const hash = userId.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  return gradients[Math.abs(hash) % gradients.length];
};

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
  const gradient = useMemo(() => getGradientForUser(userId), [userId]);

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
      <AvatarFallback style={{ background: gradient }} className="text-white font-semibold">
        {profile ? getInitials(profile.full_name) : <User size={size === 'sm' ? 16 : size === 'md' ? 20 : 24} />}
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
          <AvatarFallback style={{ background: gradient }} className="text-white font-semibold">
            {profile ? getInitials(profile.full_name) : <User size={size === 'sm' ? 16 : size === 'md' ? 20 : 24} />}
          </AvatarFallback>
        </Avatar>
  );
}
