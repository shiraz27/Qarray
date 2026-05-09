import { Card } from '@/components/ui/card';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Volume2, Loader2, Clock, RefreshCw, Download, ExternalLink, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { AudioPlayerModal } from '@/components/AudioPlayerModal';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MediaPreviewProps {
  url: string;
  className?: string;
}

function extractRecordingNumber(url: string): string | undefined {
  const match = url.match(/recording-(\d+)/);
  return match ? match[1] : undefined;
}

export function MediaPreview({ url, className = '' }: MediaPreviewProps) {
  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const [imageZoomOpen, setImageZoomOpen] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();
  
  // Ensure URL has encoded spaces for proper loading
  const encodedUrl = url.replace(/ /g, '%20');
  
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

  const youtubeEmbedUrl = getYouTubeEmbedUrl(url);
  const lowerUrl = url.toLowerCase();

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
        const last = new URL(url).pathname.split('/').filter(Boolean).pop() || 'document.pdf';
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
        const { data, error } = await supabase.functions.invoke('fetch-media', { body: { url } });
        if (error) throw error;
        let blob: Blob;
        if (data instanceof Blob) {
          if (data.type.includes('application/json')) {
            const text = await data.text();
            const parsed = JSON.parse(text);
            throw new Error(parsed?.error || 'File unavailable');
          }
          blob = data;
        } else if (data instanceof ArrayBuffer) {
          blob = new Blob([data], { type: 'application/pdf' });
        } else {
          throw new Error('Unexpected response');
        }
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
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
            <Button variant="ghost" size="sm" asChild className="gap-1">
              <a
                href={encodedUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">Open</span>
              </a>
            </Button>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p className="leading-snug">
            If you have an ad blocker enabled, the "Open" link may not work. Disable it for this site or use the Download button.
          </p>
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
              <img 
                src={encodedUrl} 
                alt="Media content" 
                className="max-w-full max-h-[90vh] object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (isAudio) {
    const recordingNumber = extractRecordingNumber(url);
    return (
      <>
        <Card 
          className={`overflow-hidden ${className} p-3 hover:shadow-md transition-all cursor-pointer`}
          onClick={() => setAudioModalOpen(true)}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Audio Recording</p>
              <p className="text-xs text-muted-foreground">Click to play</p>
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
