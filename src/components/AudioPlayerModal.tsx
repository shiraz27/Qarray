import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AudioPlayer } from '@/components/AudioPlayer';

interface AudioPlayerModalProps {
  open: boolean;
  onClose: () => void;
  url: string;
  recordingNumber?: string;
}

export const AudioPlayerModal: React.FC<AudioPlayerModalProps> = ({
  open,
  onClose,
  url,
  recordingNumber,
}) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Audio Player</DialogTitle>
        </DialogHeader>
        <AudioPlayer 
          url={url} 
          recordingNumber={recordingNumber}
        />
      </DialogContent>
    </Dialog>
  );
};
