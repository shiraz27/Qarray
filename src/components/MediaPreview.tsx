import { Card } from '@/components/ui/card';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Volume2, Loader2, Clock, RefreshCw, Download, ExternalLink, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { AudioPlayerModal } from '@/components/AudioPlayerModal';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { fetchPdfViaProxy, triggerBlobDownload } from '@/utils/pdfMediaFetch';
import {
  triggerWatermarkedDownload,
  watermarkImageBlob,
  watermarkPdfBlob,
} from '@/utils/watermark';
import { mediaSrc, isMediaToken, tokenInnerPath } from '@/utils/mediaToken';
import { useUploadManager } from '@/contexts/UploadManagerContext';
import { Progress } from '@/components/ui/progress';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';


interface MediaPreviewProps {
  url: string;
  className?: string;
}

function extractRecordingNumber(url: string): string | undefined {
  const target = isMediaToken(url) ? tokenInnerPath(url) : url;
  const match = target.match(/recording-(\d+)/);
  return match ? match[1] : undefined;
}

export function MediaPreview({ url, className = '' }: MediaPreviewProps) {
  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const [imageZoomOpen, setImageZoomOpen] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();
  const { items: uploadItems } = useUploadManager();
  const { enabled: downloadFileEnabled, loading: downloadFileFlagLoading } =
    useFeatureFlag('download_file');
  const showFileDownload = downloadFileFlagLoading || downloadFileEnabled !== false;

  // Internal "browser-loadable" src — always routed through our media proxy so
  // the storage origin never appears in the DOM or in network requests.
  const encodedUrl = mediaSrc(url);
  // For type detection only — never used as a network/href value.
  const detectionUrl = isMediaToken(url) ? tokenInnerPath(url) : url;

  // Check if it's a YouTube URL
  const getYouTubeEmbedUrl = (url: string) => {
    const patterns = [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&]+)/,
      /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^?]+)/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^?]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return `https://www.youtube.com/embed/${match[1]}`;
      }
    }
    return null;
  };

  const youtubeEmbedUrl = getYouTubeEmbedUrl(detectionUrl);
  const lowerUrl = detectionUrl.toLowerCase();

  // Check if it's a PDF (including Archive.org sanitized URLs)
  const isPdf = lowerUrl.includes('.pdf') || 
                lowerUrl.endsWith('-pdf') ||
                lowerUrl.includes('-pdf/') ||
                lowerUrl.includes('-pdf?');

  // Check if it's an image (including Archive.org sanitized URLs)
  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)/i.test(url) || 
                  /-(jpg|jpeg|png|gif|webp)($|[/?#])/i.test(url) ||
                  lowerUrl.includes('image');

  // Check if it's an audio file (including Archive.org sanitized URLs)
  const isAudio = /\.(mp3|wav|webm|ogg|m4a)/i.test(url) || 
                  /-(mp3|wav|webm|ogg|m4a)($|[/?#])/i.test(url) ||
                  lowerUrl.includes('audio');

  if (youtubeEmbedUrl) {
    return (
      <Card className={`overflow-hidden ${className}`}>
        <div className="aspect-video w-full max-w-sm">
          <iframe
            width="100%"
            height="100%"
            src={youtubeEmbedUrl}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
      </Card>
    );
  }

  if (isPdf) {
    const filename = (() => {
      try {
        const last =
          new URL(detectionUrl).pathname.split('/').filter(Boolean).pop() ||
          'document.pdf';
        const decoded = decodeURIComponent(last);
        if (/-pdf$/i.test(decoded)) return decoded.replace(/-pdf$/i, '.pdf');
        if (/\.pdf$/i.test(decoded)) return decoded;
        return decoded + '.pdf';
      } catch { return 'document.pdf'; }
    })();
    const handleDownload = async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (downloading) return;
      setDownloading(true);
      try {
        const result = await fetchPdfViaProxy(url);
        if (result.kind !== 'ok') {
          throw new Error(
            result.kind === 'unavailable'
              ? 'File still processing — try again in a moment.'
              : result.message
          );
        }
        const watermarked = await watermarkPdfBlob(result.blob);
        triggerWatermarkedDownload(watermarked, filename);
      } catch (err) {
        toast({
          title: 'Download failed',
          description: err instanceof Error ? err.message : 'Could not download PDF',
          variant: 'destructive',
        });
      } finally {
        setDownloading(false);
      }
    };
    return (
      <Card className={`overflow-hidden ${className} p-4 hover:shadow-md transition-all`}>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-3xl">📄</div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{filename}</p>
            <p className="text-xs text-muted-foreground">PDF document</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {showFileDownload && (
              <Button
                variant="default"
                size="sm"
                onClick={handleDownload}
                disabled={downloading}
                className="gap-1"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Download</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild className="gap-1">
              <a
                href={encodedUrl}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">Open in tab</span>
              </a>
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (isImage) {
    return (
      <>
        {/* Loading state */}
        {imageLoading && !imageError && (
          <Card className={`overflow-hidden ${className} p-8 flex flex-col items-center justify-center gap-3 min-h-[200px]`}>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading image...</p>
          </Card>
        )}
        
        {/* Error/Processing state */}
        {imageError && (
          <Card className={`overflow-hidden ${className} p-8 flex flex-col items-center justify-center gap-3 min-h-[200px] bg-muted/50`}>
            <Clock className="h-8 w-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">Image processing...</p>
              <p className="text-xs text-muted-foreground">The file may still be uploading. Please wait a moment and refresh.</p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setImageError(false);
                setImageLoading(true);
              }}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </Card>
        )}
        
        {/* Actual image - hidden when loading or error */}
        <Card 
          className={`overflow-hidden ${className} cursor-pointer hover:shadow-lg transition-all border-border`}
          onClick={() => setImageZoomOpen(true)}
          style={{ display: imageLoading || imageError ? 'none' : 'block' }}
        >
            <div className="relative">
              <img
                src={encodedUrl}
                alt="Media content"
                className="w-full h-full object-cover rounded-lg"
                style={{ minHeight: '200px', maxHeight: '500px' }}
                onLoad={() => setImageLoading(false)}
                onError={(e) => {
                  console.error('Image failed to load:', encodedUrl);
                  setImageLoading(false);
                  setImageError(true);
                }}
              />

              {/* watermark overlay (preview only; download is stamped serverlessly) */}
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


              {showFileDownload && (
              <div className="absolute top-2 right-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-black/40 text-white hover:bg-black/55"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (downloading) return;
                    setDownloading(true);
                    try {
                      const res = await fetch(encodedUrl);
                      if (!res.ok) throw new Error('Could not download image');
                      const blob = await res.blob();
                      const watermarked = await watermarkImageBlob(blob);
                      const filename = (() => {
                        try {
                          const u = new URL(detectionUrl);
                          const last = u.pathname.split('/').filter(Boolean).pop();
                          return last || 'image';
                        } catch {
                          return 'image';
                        }
                      })();
                      triggerWatermarkedDownload(watermarked, filename);
                    } catch (err) {
                      toast({
                        title: 'Download failed',
                        description:
                          err instanceof Error
                            ? err.message
                            : 'Could not watermark/download image',
                        variant: 'destructive',
                      });
                    } finally {
                      setDownloading(false);
                    }
                  }}
                >
                  {downloading ? '…' : 'Download'}
                </Button>
              </div>
              )}
            </div>
          </Card>

        
        <Dialog open={imageZoomOpen} onOpenChange={setImageZoomOpen}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none">
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
                onClick={() => setImageZoomOpen(false)}
              >
                <X className="h-6 w-6" />
              </Button>
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  src={encodedUrl}
                  alt="Media content"
                  className="max-w-full max-h-[90vh] object-contain"
                />
                {/* watermark overlay (preview only; download is stamped serverlessly) */}
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
            </div>
          </DialogContent>
        </Dialog>

      </>
    );
  }

  if (isAudio) {
    const recordingNumber = extractRecordingNumber(url);
    // Surface the in-flight upload (if any) directly on the card so users
    // aren't left wondering why playback "doesn't work".
    const decoded = isMediaToken(url) ? tokenInnerPath(url) : url;
    const tail = decoded.split('/').filter(Boolean).pop() || '';
    const activeUpload = uploadItems.find(
      (u) =>
        u.fileType === 'audio' &&
        (u.status === 'queued' || u.status === 'uploading' || u.status === 'paused') &&
        (u.url === url || (tail && (u.fileName === tail || decoded.includes(u.fileName)))),
    );
    const uploadPct = activeUpload ? Math.round((activeUpload.progress || 0) * 100) : 0;
    return (
      <>
        <Card 
          className={`overflow-hidden ${className} p-3 transition-all ${
            activeUpload ? 'opacity-90' : 'hover:shadow-md cursor-pointer'
          }`}
          onClick={() => { if (!activeUpload) setAudioModalOpen(true); }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              {activeUpload ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              ) : (
                <Volume2 className="w-5 h-5 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="font-medium text-sm">Audio Recording</p>
              {activeUpload ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Uploading… {uploadPct}%
                  </p>
                  <Progress value={uploadPct} className="h-1" />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Click to play</p>
              )}
            </div>
          </div>
        </Card>
        <AudioPlayerModal
          open={audioModalOpen}
          onClose={() => setAudioModalOpen(false)}
          url={url}
          recordingNumber={recordingNumber}
        />
      </>
    );
  }

  return null;
}
