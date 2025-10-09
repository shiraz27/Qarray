import React, { useState, useEffect } from 'react';
import { Home, Bookmark, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';

interface BottomNavigationProps {
  onTabChange: (tab: string) => void;
  activeTab: string;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ onTabChange, activeTab }) => {
  const [bookmarkCount, setBookmarkCount] = useState(0);

  useEffect(() => {
    const fetchBookmarkCount = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count } = await supabase
        .from('bookmarks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setBookmarkCount(count || 0);
    };

    fetchBookmarkCount();
  }, []);

  const navigationItems = [
    { id: 'subjects', label: 'Subjects', Icon: Home },
    { id: 'bookmarks', label: 'Bookmarks', Icon: Bookmark, badge: bookmarkCount },
    { id: 'profile', label: 'Profile', Icon: User }
  ];

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-card w-full border-t border-border shadow-lg z-50">
      <nav className="flex w-full items-center text-xs font-medium whitespace-nowrap text-center justify-around px-4 py-3" aria-label="Main navigation">
        {navigationItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              className={`relative flex flex-col items-center gap-1 py-2 px-4 rounded-lg transition-all duration-300 hover-scale ${
                isActive 
                  ? 'text-primary font-semibold' 
                  : 'text-muted-foreground hover:text-primary'
              }`}
              onClick={() => onTabChange(item.id)}
              aria-pressed={isActive}
              aria-label={`Navigate to ${item.label}`}
            >
              <Icon 
                className={`w-6 h-6 transition-all duration-200 ${isActive ? 'scale-110' : ''}`}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className={`text-xs transition-all duration-200 ${isActive ? 'font-semibold' : 'font-normal'}`}>
                {item.label}
              </span>
              {item.id === 'bookmarks' && bookmarkCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-6 min-w-[1.5rem] bg-red-500 hover:bg-red-600 text-white border-0 flex items-center justify-center px-1.5 font-bold shadow-lg">
              {bookmarkCount}
            </Badge>
              )}
            </button>
          );
        })}
      </nav>
      <div className="flex justify-center items-center w-full py-2">
        <div className="bg-gray-300 w-32 h-1 rounded-full" />
      </div>
    </footer>
  );
};
