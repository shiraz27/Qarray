import React from 'react';
import { Bell } from 'lucide-react';

interface HeaderProps {
  userName?: string;
}

export const Header: React.FC<HeaderProps> = ({ userName = "Osman" }) => {
  console.log('Header rendering with userName:', userName);
  
  return (
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
          onClick={() => console.log('Notifications clicked')}
        >
          <Bell className="h-6 w-6 text-destructive" />
        </button>
      </nav>
    </header>
  );
};