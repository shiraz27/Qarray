import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Brain } from 'lucide-react';
import { MemorizationsModal } from './MemorizationsModal';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

interface MemorizeButtonProps {
  subjectId?: number;
  chapterId?: number;
}

export const MemorizeButton = ({ subjectId, chapterId }: MemorizeButtonProps) => {
  const [modalOpen, setModalOpen] = useState(false);
  const { enabled, loading } = useFeatureFlag('memorizations');

  // Don't render if feature is disabled or still loading
  if (loading || enabled === false) {
    return null;
  }

  return (
    <>
      <Button
        onClick={() => setModalOpen(true)}
        className="gap-2 text-white hover:opacity-90 w-full bg-gradient-to-br from-gray-900 via-black to-gray-950"
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
