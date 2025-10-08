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

interface ImagePreviewDialogProps {
  open: boolean;
  imageUrl: string;
  isProcessing: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}

export const ImagePreviewDialog: React.FC<ImagePreviewDialogProps> = ({
  open,
  imageUrl,
  isProcessing,
  onKeep,
  onDiscard,
}) => {
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview Image</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {isProcessing ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm text-muted-foreground">Processing image...</p>
            </div>
          ) : (
            <img 
              src={imageUrl} 
              alt="Preview" 
              className="max-w-full max-h-[60vh] object-contain rounded-lg"
            />
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
                Processing...
              </>
            ) : (
              'Use This Image'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
