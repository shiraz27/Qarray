import React, { useState } from 'react';
import { Calculator, Atom, Code, BookOpen, Globe } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Subject {
  id: string;
  name: string;
  icon: LucideIcon;
  isActive?: boolean;
}

const subjects: Subject[] = [
  {
    id: 'maths',
    name: 'Maths',
    icon: Calculator,
    isActive: true
  },
  {
    id: 'physique',
    name: 'Physique',
    icon: Atom
  },
  {
    id: 'programming',
    name: 'Program..',
    icon: Code
  },
  {
    id: 'francais',
    name: 'Français',
    icon: BookOpen
  },
  {
    id: 'anglais',
    name: 'Anglais',
    icon: Globe
  }
];

export const SubjectTabs: React.FC = () => {
  const [activeSubject, setActiveSubject] = useState('maths');

  const handleSubjectClick = (subjectId: string) => {
    setActiveSubject(subjectId);
    console.log(`Selected subject: ${subjectId}`);
  };

  return (
    <nav className="w-full text-xs text-[#BDBDBD] font-normal whitespace-nowrap text-center tracking-[0.2px] leading-[1.6] px-2.5 py-4 overflow-x-auto" aria-label="Subject navigation">
      <div className="flex w-full items-center gap-4 justify-start sm:justify-center rounded-xl min-w-max sm:min-w-0">
        {subjects.map((subject) => {
          const isActive = activeSubject === subject.id;
          const Icon = subject.icon;
          return (
            <button
              key={subject.id}
              className={`items-center flex flex-col flex-shrink-0 sm:flex-1 pb-2 ${
                isActive 
                  ? 'text-[#38a6ff] font-semibold border-b-2 border-[#38A6FF]' 
                  : 'text-[#9E9E9E] border-b-2 border-transparent hover:text-[#38a6ff] transition-colors'
              }`}
              onClick={() => handleSubjectClick(subject.id)}
              aria-pressed={isActive}
              aria-label={`Select ${subject.name} subject`}
            >
              <Icon
                size={24}
                className={isActive ? 'text-[#38a6ff]' : 'text-[#9E9E9E]'}
              />
              <span className="mt-1">
                {subject.name}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
