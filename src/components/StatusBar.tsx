import React from 'react';

export const StatusBar: React.FC = () => {
  return (
    <header className="flex w-full flex-col text-base text-black font-medium whitespace-nowrap leading-none justify-center bg-white px-6 py-3.5">
      <time className="text-black">
        9:41
      </time>
    </header>
  );
};
