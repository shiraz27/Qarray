import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Bell } from 'lucide-react';
import { NotificationPanel } from './NotificationPanel';

interface HeaderProps {
  userName?: string;
}

export const Header: React.FC<HeaderProps> = ({ userName = "Osman" }) => {
  const [notificationCount, setNotificationCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    fetchNotificationCount();
    
    // Subscribe to new notifications
    const setupSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const channel = supabase
        .channel('notifications-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`
          },
          () => {
            fetchNotificationCount();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    setupSubscription();
  }, []);

  const fetchNotificationCount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;
      setNotificationCount(count || 0);
    } catch (error) {
      console.error('Error fetching notification count:', error);
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
            className="relative"
            onClick={() => setShowNotifications(true)}
          >
            <Bell className="h-6 w-6 text-destructive" />
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
        </nav>
      </header>
      
      <NotificationPanel 
        open={showNotifications} 
        onClose={() => {
          setShowNotifications(false);
          fetchNotificationCount();
        }} 
      />
    </>
  );
};