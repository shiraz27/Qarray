import React from 'react';
import { Home, Bookmark, User } from 'lucide-react';

interface BottomNavigationProps {
  onTabChange: (tab: string) => void;
  activeTab: string;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ onTabChange, activeTab }) => {
  const navigationItems = [
    { id: 'subjects', label: 'Subjects', Icon: Home },
    { id: 'bookmarks', label: 'Bookmarks', Icon: Bookmark },
    { id: 'profile', label: 'Profile', Icon: User }
  ];

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-white w-full border-t border-gray-100 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] z-50">
      <nav className="flex w-full items-center text-xs font-medium whitespace-nowrap text-center justify-around px-4 py-3" aria-label="Main navigation">
        {navigationItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              className={`flex flex-col items-center gap-1 py-2 px-4 rounded-lg transition-all duration-200 ${
                isActive 
                  ? 'text-[#38a6ff]' 
                  : 'text-[#9E9E9E] hover:text-[#38a6ff] hover:bg-gray-50'
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
