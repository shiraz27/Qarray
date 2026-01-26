import React, { useState, useEffect } from 'react';
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
  FileText,
  CloudUpload
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const UploadStatusIndicator: React.FC = () => {
  const { items, hasActiveUploads, pendingCount, completedCount, failedCount, retryUpload, removeFromQueue } = useUploadManager();
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-expand when there are active uploads
  useEffect(() => {
    if (hasActiveUploads && !isExpanded) {
      setIsExpanded(true);
    }
  }, [hasActiveUploads]);

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

  // Calculate overall progress
  const totalItems = items.length;
  const completedItems = items.filter(i => i.status === 'completed').length;
  const uploadingItem = items.find(i => i.status === 'uploading');
  const currentProgress = uploadingItem?.progress || 0;
  
  // Overall progress: completed items + partial progress of current item
  const overallProgress = totalItems > 0 
    ? Math.round(((completedItems + (currentProgress / 100)) / totalItems) * 100)
    : 0;

  return (
    <div className="fixed bottom-20 right-4 z-50 md:bottom-4 animate-fade-in">
      <Card className={cn(
        "shadow-lg border-primary/20 transition-all duration-200 bg-background/95 backdrop-blur-sm",
        isExpanded ? "w-80" : "w-auto",
        hasActiveUploads && "ring-2 ring-primary/30"
      )}>
        {/* Header - always visible */}
        <div 
          className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="relative flex-shrink-0">
            {hasActiveUploads ? (
              <div className="relative">
                <CloudUpload className="h-5 w-5 text-primary animate-pulse" />
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-primary rounded-full animate-ping" />
              </div>
            ) : failedCount > 0 ? (
              <X className="h-5 w-5 text-destructive" />
            ) : (
              <Check className="h-5 w-5 text-green-500" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {hasActiveUploads 
                ? `Uploading ${pendingCount} file${pendingCount !== 1 ? 's' : ''}`
                : failedCount > 0
                  ? `${failedCount} upload${failedCount !== 1 ? 's' : ''} failed`
                  : `${completedCount} upload${completedCount !== 1 ? 's' : ''} complete`
              }
            </p>
            {hasActiveUploads && (
              <div className="flex items-center gap-2 mt-1">
                <Progress value={overallProgress} className="h-1.5 flex-1" />
                <span className="text-xs text-muted-foreground font-medium min-w-[2.5rem]">
                  {overallProgress}%
                </span>
              </div>
            )}
          </div>

          <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0">
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
                <div className="flex-shrink-0 text-muted-foreground">
                  {getFileIcon(item.fileType)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.fileName}</p>
                  {item.status === 'uploading' && (
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={item.progress} className="h-1 flex-1" />
                      <span className="text-[10px] text-muted-foreground">{item.progress}%</span>
                    </div>
                  )}
                  {item.status === 'queued' && (
                    <p className="text-[10px] text-muted-foreground">Waiting...</p>
                  )}
                  {item.status === 'failed' && item.error && (
                    <p className="text-[10px] text-destructive truncate">{item.error}</p>
                  )}
                  {item.status === 'completed' && (
                    <p className="text-[10px] text-green-600">Completed</p>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
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
