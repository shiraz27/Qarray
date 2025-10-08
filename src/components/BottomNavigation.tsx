import React, { useState } from 'react';
import { Home, Bookmark, User } from 'lucide-react';

interface NavigationItem {
  id: string;
  label: string;
  isActive?: boolean;
}

const navigationItems: NavigationItem[] = [
  {
    id: 'subjects',
    label: 'Subjects',
    isActive: true
  },
  {
    id: 'bookmarks',
    label: 'Bookmarks'
  },
  {
    id: 'profile',
    label: 'Profile'
  }
];

export const BottomNavigation: React.FC = () => {
  const [activeItem, setActiveItem] = useState('subjects');

  const handleNavigationClick = (itemId: string) => {
    setActiveItem(itemId);
    console.log(`Navigated to: ${itemId}`);
  };

  return (
    <footer className="bg-white w-full border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
      <nav className="flex w-full items-center text-xs font-medium whitespace-nowrap text-center justify-around px-4 py-3" aria-label="Main navigation">
        {navigationItems.map((item) => {
          const isActive = activeItem === item.id;
          const Icon = item.id === 'subjects' ? Home : item.id === 'bookmarks' ? Bookmark : User;
          return (
            <button
              key={item.id}
              className={`flex flex-col items-center gap-1 py-2 px-4 rounded-lg transition-all duration-200 ${
                isActive 
                  ? 'text-[#38a6ff]' 
                  : 'text-[#9E9E9E] hover:text-[#38a6ff] hover:bg-gray-50'
              }`}
              onClick={() => handleNavigationClick(item.id)}
              aria-pressed={isActive}
              aria-label={`Navigate to ${item.label}`}
            >
              <Icon 
                className="w-6 h-6 transition-transform duration-200" 
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className={`text-xs ${isActive ? 'font-semibold' : 'font-normal'}`}>
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
