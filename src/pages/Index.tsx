import React from 'react';
import { StatusBar } from '@/components/StatusBar';
import { Header } from '@/components/Header';
import { ActionButtons } from '@/components/ActionButtons';
import { SubjectTabs } from '@/components/SubjectTabs';
import { MainContent } from '@/components/MainContent';
import { BottomNavigation } from '@/components/BottomNavigation';

const Index: React.FC = () => {
  return (
    <div className="justify-center items-stretch flex max-w-[480px] w-full flex-col overflow-hidden bg-white mx-auto">
      <StatusBar />
      
      <div className="min-h-[674px] w-full overflow-hidden">
        <section className="items-stretch flex min-h-[210px] w-full flex-col bg-white">
          <Header userName="Osman" />
          
          <div className="flex justify-center mt-4">
            <img
              src="https://api.builder.io/api/v1/image/assets/a6410069d4c34ccabf25d52a6064b0e1/690fbf551718dd4374bdf3773c038c355abbe5a5?placeholderIfAbsent=true"
              className="aspect-[0.83] object-contain w-[57px]"
              alt="Educational mascot logo"
            />
          </div>
          
          <ActionButtons />
        </section>
        
        <SubjectTabs />
        <MainContent />
      </div>
      
      <BottomNavigation />
    </div>
  );
};

export default Index;
