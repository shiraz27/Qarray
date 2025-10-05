import React, { useState } from 'react';

interface Subject {
  id: string;
  name: string;
  icon: string;
  isActive?: boolean;
}

const subjects: Subject[] = [
  {
    id: 'maths',
    name: 'Maths',
    icon: 'https://api.builder.io/api/v1/image/assets/a6410069d4c34ccabf25d52a6064b0e1/7d0c53986bb3ae1f1756275f338ff652c3f2470f?placeholderIfAbsent=true',
    isActive: true
  },
  {
    id: 'physique',
    name: 'Physique',
    icon: 'https://api.builder.io/api/v1/image/assets/a6410069d4c34ccabf25d52a6064b0e1/554d9bfd3ad715f545aec16a8fb5f21a6abf7f82?placeholderIfAbsent=true'
  },
  {
    id: 'programming',
    name: 'Program..',
    icon: 'https://api.builder.io/api/v1/image/assets/a6410069d4c34ccabf25d52a6064b0e1/ba62c41a9a8f3817be694da90d9c702fa3d20e8d?placeholderIfAbsent=true'
  },
  {
    id: 'francais',
    name: 'Français',
    icon: 'https://api.builder.io/api/v1/image/assets/a6410069d4c34ccabf25d52a6064b0e1/7ef67eb15bb29027fee2d1892294875b0357b0f1?placeholderIfAbsent=true'
  },
  {
    id: 'anglais',
    name: 'Anglais',
    icon: 'https://api.builder.io/api/v1/image/assets/a6410069d4c34ccabf25d52a6064b0e1/826bb788a31a51e56eabb0f7cb5398b3d9d39efb?placeholderIfAbsent=true'
  }
];

export const SubjectTabs: React.FC = () => {
  const [activeSubject, setActiveSubject] = useState('maths');

  const handleSubjectClick = (subjectId: string) => {
    setActiveSubject(subjectId);
    console.log(`Selected subject: ${subjectId}`);
  };

  return (
    <nav className="w-full text-xs text-[#BDBDBD] font-normal whitespace-nowrap text-center tracking-[0.2px] leading-[1.6] flex-1 px-2.5 py-4" aria-label="Subject navigation">
      <div className="flex w-full items-center gap-4 justify-center rounded-xl">
        {subjects.map((subject) => {
          const isActive = activeSubject === subject.id;
          return (
            <button
              key={subject.id}
              className={`items-center self-stretch flex flex-col flex-1 shrink basis-[0%] my-auto ${
                isActive 
                  ? 'text-[#38a6ff] font-semibold border-b-2 border-b-[#38A6FF] border-solid' 
                  : 'hover:text-[#38a6ff] transition-colors'
              }`}
              onClick={() => handleSubjectClick(subject.id)}
              aria-pressed={isActive}
              aria-label={`Select ${subject.name} subject`}
            >
              <img
                src={subject.icon}
                className="aspect-[1] object-contain w-6"
                alt=""
              />
              <span className={`mt-1 ${isActive ? '' : 'text-[#BDBDBD]'}`}>
                {subject.name}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
