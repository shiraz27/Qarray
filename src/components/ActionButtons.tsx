import React from 'react';

export const ActionButtons: React.FC = () => {
  const handleAskClick = () => {
    console.log('Ask button clicked');
  };

  const handleAnswerClick = () => {
    console.log('Answer button clicked');
  };

  const handleAddResourceClick = () => {
    console.log('Add Resource button clicked');
  };

  return (
    <section className="flex w-full flex-col overflow-hidden items-stretch text-xs text-white font-medium tracking-[0.2px] leading-[1.6] justify-center mt-4 px-4">
      <div className="flex min-h-10 w-full items-center gap-2 overflow-hidden justify-center flex-wrap sm:flex-nowrap">
        <button
          className="justify-center items-center flex gap-0.5 whitespace-nowrap bg-[#38A6FF] px-2.5 py-2 rounded-lg hover:bg-[#2B8FE8] transition-colors flex-1 sm:flex-none"
          onClick={handleAskClick}
          aria-label="Ask a question"
        >
          <div className="flex w-6 shrink-0 h-6" />
          <span className="text-white">
            Ask
          </span>
        </button>
        <button
          className="justify-center items-center flex gap-0.5 whitespace-nowrap bg-[#38A6FF] px-2.5 py-2 rounded-lg hover:bg-[#2B8FE8] transition-colors flex-1 sm:flex-none"
          onClick={handleAnswerClick}
          aria-label="Find answers"
        >
          <div className="flex w-6 shrink-0 h-6" />
          <span className="text-white">
            Answer
          </span>
        </button>
        <button
          className="justify-center items-center flex gap-0.5 bg-[#F6A18A] px-2.5 py-2 rounded-lg hover:bg-[#F4927A] transition-colors flex-1 sm:flex-none"
          onClick={handleAddResourceClick}
          aria-label="Add learning resource"
        >
          <div className="flex w-6 shrink-0 h-6" />
          <span className="text-white">
            Add Resource
          </span>
        </button>
      </div>
    </section>
  );
};
