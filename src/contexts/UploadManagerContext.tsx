import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getSessionByRoute, persistUrlToSessionByRoute, type FormSession } from '@/hooks/useFormPersistence';
import { uploadFileToArchiveControlled, type ArchiveUploadController } from '@/utils/archiveMultipartUpload';
import { uploadPdfMaybeSplit } from '@/utils/pdfSplitUpload';

export interface UploadItem {
  id: string;
  file: File;
  fileName: string;
  fileType: 'image' | 'audio' | 'pdf';
  status: 'queued' | 'uploading' | 'paused' | 'completed' | 'failed';
  progress: number;
  url?: string;
  error?: string;
  retryCount: number;
  chapterId?: number;
  contentType?: string;
  contentId?: string;
  callbackId?: string;
  sourceRoute?: string;
}

interface UploadOptions {
  fileType: 'image' | 'audio' | 'pdf';
  chapterId?: number;
  contentType?: string;
  contentId?: string;
  callbackId?: string;
  sourceRoute?: string;
}

interface UploadManagerContextType {
  addToQueue: (file: File, options: UploadOptions) => string;
  removeFromQueue: (id: string) => void;
  retryUpload: (id: string) => void;
  pauseUpload: (id: string) => void;
  resumeUpload: (id: string) => void;
  cancelUpload: (id: string) => void;
  clearCompleted: () => void;
  getUploadsByCallback: (callbackId: string) => UploadItem[];
  onUploadComplete: (callbackId: string, callback: (url: string, fileType: string, file?: File) => void) => () => void;
  items: UploadItem[];
  hasActiveUploads: boolean;
  pendingCount: number;
  completedCount: number;
  failedCount: number;
  activeSourceRoutes: string[];
  getFormSessionForRoute: (route: string) => FormSession | null;
}

const UploadManagerContext = createContext<UploadManagerContextType | null>(null);

export const useUploadManager = () => {
  const context = useContext(UploadManagerContext);
  if (!context) {
    throw new Error('useUploadManager must be used within UploadManagerProvider');
  }
  return context;
};

const MAX_RETRIES = 3;
const DELAY_BETWEEN_UPLOADS = 1500; // 1.5 seconds

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const UploadManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const callbacksRef = useRef<Map<string, Set<(url: string, fileType: string, file?: File) => void>>>(new Map());
  const isProcessingRef = useRef(false);
  const queueRef = useRef<UploadItem[]>([]);
  const controllersRef = useRef<Map<string, ArchiveUploadController>>(new Map());

  // Calculate counts
  const hasActiveUploads = items.some(item => item.status === 'queued' || item.status === 'uploading' || item.status === 'paused');
  const pendingCount = items.filter(item => item.status === 'queued' || item.status === 'uploading' || item.status === 'paused').length;
  const completedCount = items.filter(item => item.status === 'completed').length;
  const failedCount = items.filter(item => item.status === 'failed').length;
  
  // Get unique source routes from active/pending uploads
  const activeSourceRoutes = [...new Set(
    items
      .filter(item => item.status === 'queued' || item.status === 'uploading' || item.status === 'paused' || item.status === 'completed')
      .map(item => item.sourceRoute)
      .filter((route): route is string => !!route)
  )];

  // Browser close warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasActiveUploads) {
        e.preventDefault();
        e.returnValue = 'You have uploads in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasActiveUploads]);

  // Process queue
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    
    const nextItem = queueRef.current.find(item => item.status === 'queued');
    if (!nextItem) {
      isProcessingRef.current = false;
      return;
    }

    isProcessingRef.current = true;

    // Update status to uploading
    setItems(prev => prev.map(item => 
      item.id === nextItem.id ? { ...item, status: 'uploading' as const, progress: 0 } : item
    ));
    queueRef.current = queueRef.current.map(item =>
      item.id === nextItem.id ? { ...item, status: 'uploading' as const } : item
    );

    try {
      const result = await uploadWithRetry(nextItem);
      
      // Update item as completed
      setItems(prev => prev.map(item => 
        item.id === nextItem.id ? { ...item, status: 'completed' as const, progress: 100, url: result.url } : item
      ));
      queueRef.current = queueRef.current.map(item =>
        item.id === nextItem.id ? { ...item, status: 'completed' as const, url: result.url } : item
      );

      // CRITICAL: Persist URL directly to localStorage session
      // This ensures the URL is saved even if the form dialog is closed
      if (nextItem.sourceRoute) {
        persistUrlToSessionByRoute(nextItem.sourceRoute, result.url);
      }

      // Notify callbacks (for when form is still open)
      // Pass the original File blob so consumers can skip re-fetching from the
      // remote host (useful for OCR right after upload).
      if (nextItem.callbackId) {
        const callbacks = callbacksRef.current.get(nextItem.callbackId);
        if (callbacks) {
          callbacks.forEach(cb => cb(result.url, nextItem.fileType, nextItem.file));
        }
      }

      toast.success(`${nextItem.fileName} uploaded successfully`);

    } catch (error: any) {
      console.error('Upload failed:', error);
      const isCancel = error?.name === 'AbortError';
      // Update item as failed
      setItems(prev => prev.map(item => 
        item.id === nextItem.id ? { 
          ...item, 
          status: isCancel ? 'failed' as const : 'failed' as const,
          progress: 0, 
          error: isCancel ? 'Cancelled' : (error.message || 'Upload failed') 
        } : item
      ));
      queueRef.current = queueRef.current.map(item =>
        item.id === nextItem.id ? { ...item, status: 'failed' as const, error: error.message } : item
      );

      if (!isCancel) {
        toast.error(`Failed to upload ${nextItem.fileName}`, {
          action: {
            label: 'Retry',
            onClick: () => retryUpload(nextItem.id),
          },
        });
      }
    } finally {
      controllersRef.current.delete(nextItem.id);
    }

    // Wait before processing next
    await delay(DELAY_BETWEEN_UPLOADS);
    
    isProcessingRef.current = false;
    processQueue();
  }, []);

  const uploadWithRetry = async (item: UploadItem): Promise<{ url: string }> => {
    // Part-level retries are handled inside uploadFileToArchiveControlled.
    // No outer retry: full restart wastes parts archive.org already accepted.
    const onProgress = (p: { ratio: number }) => {
      const pct = Math.min(99, Math.max(0, Math.round(p.ratio * 100)));
      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, progress: pct } : i
      ));
    };

    const archiveOpts = {
      fileName: item.fileName,
      fileType: item.fileType,
      chapterId: item.chapterId,
      contentType: item.contentType,
      contentId: item.contentId,
    };

    // PDFs are routed through the split-aware uploader. It transparently
    // falls back to a single upload for short PDFs (≤ threshold pages).
    const handle = item.fileType === 'pdf'
      ? uploadPdfMaybeSplit(item.file, archiveOpts, onProgress)
      : uploadFileToArchiveControlled(item.file, archiveOpts, onProgress);
    controllersRef.current.set(item.id, handle.controller);
    return handle.promise;
  };

  const addToQueue = useCallback((file: File, options: UploadOptions): string => {
    const id = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newItem: UploadItem = {
      id,
      file,
      fileName: file.name,
      fileType: options.fileType,
      status: 'queued',
      progress: 0,
      retryCount: 0,
      chapterId: options.chapterId,
      contentType: options.contentType,
      sourceRoute: options.sourceRoute,
      contentId: options.contentId,
      callbackId: options.callbackId,
    };

    setItems(prev => [...prev, newItem]);
    queueRef.current = [...queueRef.current, newItem];

    // Start processing if not already
    setTimeout(() => processQueue(), 100);

    return id;
  }, [processQueue]);

  const removeFromQueue = useCallback((id: string) => {
    setItems(prev => {
      const item = prev.find(i => i.id === id);
      // Only allow removing queued items
      if (item?.status === 'queued') {
        queueRef.current = queueRef.current.filter(i => i.id !== id);
        return prev.filter(i => i.id !== id);
      }
      return prev;
    });
  }, []);

  const retryUpload = useCallback((id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === id && item.status === 'failed') {
        const updatedItem = { ...item, status: 'queued' as const, progress: 0, error: undefined, retryCount: 0 };
        queueRef.current = queueRef.current.map(i => i.id === id ? updatedItem : i);
        setTimeout(() => processQueue(), 100);
        return updatedItem;
      }
      return item;
    }));
  }, [processQueue]);

  const pauseUpload = useCallback((id: string) => {
    const ctrl = controllersRef.current.get(id);
    if (!ctrl) return;
    ctrl.pause();
    setItems(prev => prev.map(item =>
      item.id === id && item.status === 'uploading' ? { ...item, status: 'paused' as const } : item,
    ));
  }, []);

  const resumeUpload = useCallback((id: string) => {
    const ctrl = controllersRef.current.get(id);
    if (!ctrl) return;
    ctrl.resume();
    setItems(prev => prev.map(item =>
      item.id === id && item.status === 'paused' ? { ...item, status: 'uploading' as const } : item,
    ));
  }, []);

  const cancelUpload = useCallback((id: string) => {
    const ctrl = controllersRef.current.get(id);
    if (ctrl) {
      ctrl.cancel();
      // status will transition to 'failed' via the catch handler
    } else {
      // Not yet started: just remove from queue
      setItems(prev => prev.filter(i => i.id !== id));
      queueRef.current = queueRef.current.filter(i => i.id !== id);
    }
  }, []);

  const getUploadsByCallback = useCallback((callbackId: string): UploadItem[] => {
    return items.filter(item => item.callbackId === callbackId);
  }, [items]);

  const clearCompleted = useCallback(() => {
    setItems(prev => prev.filter(item => item.status !== 'completed' && item.status !== 'failed'));
    queueRef.current = queueRef.current.filter(item => item.status !== 'completed' && item.status !== 'failed');
  }, []);

  const onUploadComplete = useCallback((
    callbackId: string, 
    callback: (url: string, fileType: string, file?: File) => void
  ): (() => void) => {
    if (!callbacksRef.current.has(callbackId)) {
      callbacksRef.current.set(callbackId, new Set());
    }
    callbacksRef.current.get(callbackId)!.add(callback);

    // Return cleanup function
    return () => {
      const callbacks = callbacksRef.current.get(callbackId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          callbacksRef.current.delete(callbackId);
        }
      }
    };
  }, []);

  // Clear completed/failed items after 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setItems(prev => {
        const filtered = prev.filter(item => {
          if (item.status === 'completed' || item.status === 'failed') {
            // Keep items for 30 seconds after completion
            return true; // We'll handle cleanup differently
          }
          return true;
        });
        return filtered;
      });
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const getFormSessionForRoute = useCallback((route: string): FormSession | null => {
    return getSessionByRoute(route);
  }, []);

  return (
    <UploadManagerContext.Provider value={{
      addToQueue,
      removeFromQueue,
      retryUpload,
      pauseUpload,
      resumeUpload,
      cancelUpload,
      clearCompleted,
      getUploadsByCallback,
      onUploadComplete,
      items,
      hasActiveUploads,
      pendingCount,
      completedCount,
      failedCount,
      activeSourceRoutes,
      getFormSessionForRoute,
    }}>
      {children}
    </UploadManagerContext.Provider>
  );
};
