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
import { mediaSrc } from '@/utils/mediaToken';

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
    const src = mediaSrc(mediaUrl);

    switch (mediaType) {
      case 'image':
        return (
          <div className="relative max-w-full max-h-[60vh] w-full">
            <img
              src={src}
              alt="Preview"
              className="w-full h-full object-contain rounded-lg"
            />
            {/* watermark overlay (preview only; downloads are stamped) */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-none absolute top-2 left-0 right-0 flex justify-center">
                <div className="flex flex-col items-center leading-none">
                  <div className="text-[10vw] sm:text-[56px] font-black text-black/60 dark:text-white/50 -mt-1 drop-shadow-sm">
                    Qarray.TN
                  </div>
                  <div className="text-[4vw] sm:text-[18px] font-semibold text-black/30 dark:text-white/25 -mt-1">
                    -IJA AQRA BLECH-
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'audio':
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="text-4xl">🎤</div>
            <p className="text-sm text-muted-foreground">Listen to your recording</p>
            <audio controls className="w-full max-w-md">
              <source src={src} type="audio/webm" />
              <source src={src} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          </div>
        );

      case 'pdf':
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="text-4xl">📄</div>
            <p className="text-sm text-muted-foreground">PDF files are uploaded directly</p>
            <p className="text-xs text-muted-foreground max-w-md text-center">
              Note: PDF preview is not available in the browser. The file will be uploaded and can be viewed after submission.
            </p>
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
          <Button variant="outline" onClick={onDiscard} disabled={isProcessing}>
            Discard
          </Button>
          <Button onClick={onKeep} disabled={isProcessing}>
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

