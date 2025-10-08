import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Bell } from 'lucide-react';
import { NotificationPanel } from './NotificationPanel';

interface HeaderProps {
  userName?: string;
}

export const Header: React.FC<HeaderProps> = ({ userName = "Osman" }) => {
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchUnreadCount();
    
    // Set up realtime subscription for new notifications
    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications'
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;
      setUnreadCount(count || 0);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  return (
    <>
      <header className="flex w-full items-center gap-[40px_100px] justify-between px-4 py-3">
        <div className="self-stretch text-base text-[#2C2C2C] font-medium tracking-[0.2px] my-auto">
          <h1 className="text-[#2C2C2C]">
            Welcome, {userName} 👋
          </h1>
        </div>
        <nav className="self-stretch flex gap-4 my-auto px-2 py-1 rounded-3xl" aria-label="Header actions">
          <button 
            className="flex flex-col w-6"
            aria-label="Search"
            onClick={() => console.log('Search clicked')}
          >
            <div className="flex min-h-6 w-6" />
          </button>
          <button 
            aria-label="Notifications"
            onClick={() => setIsNotificationOpen(true)}
            className="relative"
          >
            <Bell className="w-6 h-6 text-destructive" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </nav>
      </header>

      <NotificationPanel 
        isOpen={isNotificationOpen} 
        onClose={() => {
          setIsNotificationOpen(false);
          fetchUnreadCount();
        }} 
      />
    </>
  );
};
