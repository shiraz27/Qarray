import React, { useState, useEffect } from 'react';
import { useUploadManager } from '@/contexts/UploadManagerContext';
import { useNavigate, useLocation } from 'react-router-dom';
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
  CloudUpload,
  ArrowLeft,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const UploadStatusIndicator: React.FC = () => {
  const { 
    items, 
    hasActiveUploads, 
    pendingCount, 
    completedCount, 
    failedCount, 
    retryUpload, 
    removeFromQueue,
    clearCompleted,
    activeSourceRoutes
  } = useUploadManager();
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

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

  // Check if we should show the return button (user is away from form)
  const showReturnButton = activeSourceRoutes.length > 0 && !activeSourceRoutes.includes(location.pathname);
  
  // Check if user is ON the form page (uploads belong here)
  const isOnFormPage = activeSourceRoutes.length > 0 && activeSourceRoutes.includes(location.pathname);

  const handleNavigateToForm = () => {
    if (showReturnButton) {
      navigate(activeSourceRoutes[0]);
    }
  };

  return (
    <div className="fixed bottom-20 right-4 z-50 md:bottom-4 animate-fade-in">
      <Card className={cn(
        "shadow-lg border-primary/20 transition-all duration-200 bg-background/95 backdrop-blur-sm",
        isExpanded ? "w-80" : "w-auto",
        hasActiveUploads && "ring-2 ring-primary/30",
        showReturnButton && "cursor-pointer ring-2 ring-primary"
      )}>
        {/* Header - clickable to navigate back OR expand */}
        <div 
          className={cn(
            "flex items-center gap-3 p-3 transition-colors",
            showReturnButton 
              ? "bg-primary/10 hover:bg-primary/20" 
              : "hover:bg-muted/50 cursor-pointer"
          )}
          onClick={() => {
            if (showReturnButton && !isExpanded) {
              handleNavigateToForm();
            } else {
              setIsExpanded(!isExpanded);
            }
          }}
        >
          <div className="relative flex-shrink-0">
            {hasActiveUploads ? (
              <div className="relative">
                <CloudUpload className="h-5 w-5 text-primary animate-pulse" />
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-primary rounded-full animate-ping" />
              </div>
            ) : showReturnButton ? (
              <ArrowLeft className="h-5 w-5 text-primary" />
            ) : failedCount > 0 ? (
              <X className="h-5 w-5 text-destructive" />
            ) : (
              <Check className="h-5 w-5 text-green-500" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {showReturnButton && !hasActiveUploads
                ? "Tap to return to form"
                : hasActiveUploads 
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
            {showReturnButton && !hasActiveUploads && (
              <p className="text-xs text-muted-foreground">
                {completedCount} file{completedCount !== 1 ? 's' : ''} ready
              </p>
            )}
            {isOnFormPage && !hasActiveUploads && completedCount > 0 && (
              <p className="text-xs text-green-600 font-medium">
                ✓ Files added to form above
              </p>
            )}
          </div>

          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t">

            {/* File list */}
            <div className="max-h-48 overflow-y-auto">
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

            {/* Clear completed button */}
            {(completedCount > 0 || failedCount > 0) && !hasActiveUploads && (
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center text-muted-foreground hover:text-foreground"
                  onClick={clearCompleted}
                >
                  <Trash2 className="h-3 w-3 mr-2" />
                  Clear list
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
