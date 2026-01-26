import React, { useState } from 'react';
import { useUploadManager } from '@/contexts/UploadManagerContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { 
  Upload, 
  Check, 
  X, 
  ChevronUp, 
  ChevronDown, 
  RefreshCw, 
  Loader2,
  FileImage,
  FileAudio,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const UploadStatusIndicator: React.FC = () => {
  const { items, hasActiveUploads, pendingCount, completedCount, failedCount, retryUpload, removeFromQueue } = useUploadManager();
  const [isExpanded, setIsExpanded] = useState(false);

  // Only show if there are items
  if (items.length === 0) return null;

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'image':
        return <FileImage className="h-4 w-4" />;
      case 'audio':
        return <FileAudio className="h-4 w-4" />;
      case 'pdf':
        return <FileText className="h-4 w-4" />;
      default:
        return <Upload className="h-4 w-4" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploading':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'completed':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <X className="h-4 w-4 text-destructive" />;
      default:
        return <Upload className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const totalItems = items.length;
  const activeItems = items.filter(i => i.status === 'queued' || i.status === 'uploading');

  return (
    <div className="fixed bottom-20 right-4 z-50 md:bottom-4">
      <Card className={cn(
        "shadow-lg transition-all duration-200",
        isExpanded ? "w-80" : "w-auto"
      )}>
        {/* Header - always visible */}
        <div 
          className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="relative">
            {hasActiveUploads ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : failedCount > 0 ? (
              <X className="h-5 w-5 text-destructive" />
            ) : (
              <Check className="h-5 w-5 text-green-500" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {hasActiveUploads 
                ? `Uploading ${pendingCount} file${pendingCount !== 1 ? 's' : ''}...`
                : failedCount > 0
                  ? `${failedCount} upload${failedCount !== 1 ? 's' : ''} failed`
                  : `${completedCount} upload${completedCount !== 1 ? 's' : ''} complete`
              }
            </p>
          </div>

          <Button variant="ghost" size="icon" className="h-6 w-6">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t max-h-64 overflow-y-auto">
            {items.map((item) => (
              <div 
                key={item.id}
                className="flex items-center gap-2 p-2 border-b last:border-b-0 hover:bg-muted/30"
              >
                {getFileIcon(item.fileType)}
                
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.fileName}</p>
                  {item.status === 'uploading' && (
                    <Progress value={item.progress} className="h-1 mt-1" />
                  )}
                  {item.status === 'failed' && item.error && (
                    <p className="text-xs text-destructive truncate">{item.error}</p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {getStatusIcon(item.status)}
                  
                  {item.status === 'failed' && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        retryUpload(item.id);
                      }}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  )}
                  
                  {item.status === 'queued' && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromQueue(item.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
