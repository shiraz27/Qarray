import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface MediaPreviewDialogProps {
  open: boolean;
  mediaUrl: string;
  mediaType: 'image' | 'audio' | 'pdf' | null;
  isProcessing: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}

export const MediaPreviewDialog: React.FC<MediaPreviewDialogProps> = ({
  open,
  mediaUrl,
  mediaType,
  isProcessing,
  onKeep,
  onDiscard,
}) => {
  const renderPreview = () => {
    if (!mediaType || !mediaUrl) return null;

    switch (mediaType) {
      case 'image':
        return (
          <img 
            src={mediaUrl} 
            alt="Preview" 
            className="max-w-full max-h-[60vh] object-contain rounded-lg"
          />
        );
      
      case 'audio':
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="text-4xl">🎤</div>
            <p className="text-sm text-muted-foreground">Listen to your recording</p>
            <audio controls className="w-full max-w-md">
              <source src={mediaUrl} type="audio/webm" />
              <source src={mediaUrl} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          </div>
        );
      
      case 'pdf':
        return (
          <div className="w-full h-[60vh]">
            <iframe
              src={`${mediaUrl}#view=FitH`}
              className="w-full h-full border rounded-lg"
              title="PDF Preview"
            />
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={!isProcessing ? onDiscard : undefined}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {mediaType === 'image' && 'Preview Image'}
            {mediaType === 'audio' && 'Preview Audio'}
            {mediaType === 'pdf' && 'Preview PDF'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {isProcessing ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm text-muted-foreground">Processing file...</p>
            </div>
          ) : (
            renderPreview()
          )}
        </div>
        <DialogFooter className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={onDiscard}
            disabled={isProcessing}
          >
            Discard
          </Button>
          <Button 
            onClick={onKeep}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              'Upload This File'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
