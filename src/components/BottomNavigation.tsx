import React, { useState } from 'react';

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
    <footer className="bg-white w-full pt-[13px]">
      <nav className="flex w-full items-center gap-[40px_83px] text-xs text-[#9E9E9E] font-normal whitespace-nowrap text-center tracking-[0.2px] leading-[1.6] justify-between px-6" aria-label="Main navigation">
        {navigationItems.map((item) => {
          const isActive = activeItem === item.id;
          return (
            <button
              key={item.id}
              className={`self-stretch flex flex-col items-center my-auto ${
                isActive ? 'text-black font-bold' : 'hover:text-black transition-colors'
              }`}
              onClick={() => handleNavigationClick(item.id)}
              aria-pressed={isActive}
              aria-label={`Navigate to ${item.label}`}
            >
              <div className="flex min-h-6 w-6" />
              <span className={`mt-1 ${isActive ? 'text-black' : 'text-[#9E9E9E]'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="justify-center items-center flex w-full flex-col bg-white pt-[21px] pb-2 px-[75px]">
        <div className="bg-black flex w-[148px] shrink-0 h-[5px] fill-black rounded-[100px]" />
      </div>
    </footer>
  );
};
