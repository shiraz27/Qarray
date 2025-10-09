import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Brain } from 'lucide-react';
import { MemorizationsModal } from './MemorizationsModal';

interface MemorizeButtonProps {
  subjectId?: number;
  chapterId?: number;
}

export const MemorizeButton = ({ subjectId, chapterId }: MemorizeButtonProps) => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setModalOpen(true)}
        className="gap-2 bg-gradient-to-r from-pink-500 to-primary hover:opacity-90 text-white"
      >
        <Brain className="w-4 h-4" />
        Memorize
      </Button>

      <MemorizationsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        subjectId={subjectId}
        chapterId={chapterId}
      />
    </>
  );
};
