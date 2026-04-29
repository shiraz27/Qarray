import { Card } from '@/components/ui/card';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Volume2, Loader2, Clock, RefreshCw, FileText, ExternalLink, Eye, ShieldAlert, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import { AudioPlayerModal } from '@/components/AudioPlayerModal';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface MediaPreviewProps {
  url: string;
  className?: string;
}

function extractRecordingNumber(url: string): string | undefined {
  const match = url.match(/recording-(\d+)/);
  return match ? match[1] : undefined;
}

function normalizeMediaUrl(mediaUrl: string): string {
  const withEncodedSpaces = mediaUrl.replace(/ /g, '%20');
  try {
    return encodeURI(decodeURI(withEncodedSpaces));
  } catch {
    return encodeURI(withEncodedSpaces);
  }
}

export function MediaPreview({ url, className = '' }: MediaPreviewProps) {
  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const [imageZoomOpen, setImageZoomOpen] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfProbeKey, setPdfProbeKey] = useState(0);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfBlocked, setPdfBlocked] = useState(false);
  const [pdfProxying, setPdfProxying] = useState(false);
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const [imageProxying, setImageProxying] = useState(false);
  
  // Fully encode URL to handle spaces, parens, accents, and malformed legacy URLs
  const encodedUrl = normalizeMediaUrl(url);
  const fetchMediaUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-media`;
  
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

  // Probe PDF availability through fetch-media (which handles Archive.org propagation retries)
  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;
    setPdfStatus('loading');
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('fetch-media', {
          body: { url: encodedUrl },
        });
        if (cancelled) return;
        // fetch-media returns the file blob on success, or { unavailable: true } JSON on failure
        if (error) {
          setPdfStatus('unavailable');
          return;
        }
        if (data && typeof data === 'object' && (data as any).unavailable) {
          setPdfStatus('unavailable');
          return;
        }
        setPdfStatus('ready');
      } catch (e) {
        if (!cancelled) setPdfStatus('unavailable');
      }
    })();
    return () => { cancelled = true; };
  }, [isPdf, encodedUrl, pdfProbeKey]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      if (imageBlobUrl) URL.revokeObjectURL(imageBlobUrl);
    };
  }, [pdfBlobUrl, imageBlobUrl]);

  // Detect blocked iframe (ad blocker / ERR_BLOCKED_BY_CLIENT) when preview opens
  useEffect(() => {
    if (!pdfPreviewOpen || pdfBlobUrl) return;
    setPdfBlocked(false);
    const timer = setTimeout(() => {
      // If iframe didn't signal load within 4s, likely blocked
      setPdfBlocked(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [pdfPreviewOpen, pdfBlobUrl]);

  const loadProxyBlob = async (target: 'pdf' | 'image') => {
    const setter = target === 'pdf' ? setPdfBlobUrl : setImageBlobUrl;
    const proxying = target === 'pdf' ? setPdfProxying : setImageProxying;
    proxying(true);
    try {
      const res = await fetch(
        `https://xwqmdhnuthprzfbyoxlb.supabase.co/functions/v1/fetch-media`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3cW1kaG51dGhwcnpmYnlveGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4ODcxNzIsImV4cCI6MjA3NTQ2MzE3Mn0.qVP6vOLYLZcgGGIWNK5ZmydzoI4CbTZa6EPl1Q8ruKY',
          },
          body: JSON.stringify({ url: encodedUrl }),
        }
      );
      const contentType = res.headers.get('Content-Type') || '';
      if (!res.ok || contentType.includes('application/json')) {
        throw new Error('Proxy unavailable');
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      setter(blobUrl);
    } catch (e) {
      console.error('Proxy fetch failed:', e);
    } finally {
      proxying(false);
    }
  };

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
    if (pdfStatus === 'loading') {
      return (
        <Card className={`overflow-hidden ${className} p-8 flex flex-col items-center justify-center gap-3 min-h-[160px]`}>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading document...</p>
        </Card>
      );
    }
    if (pdfStatus === 'unavailable') {
      return (
        <Card className={`overflow-hidden ${className} p-8 flex flex-col items-center justify-center gap-3 min-h-[160px] bg-muted/50`}>
          <Clock className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium">Document is being processed...</p>
            <p className="text-xs text-muted-foreground">The file may still be uploading. Please wait a moment and retry.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPdfProbeKey((k) => k + 1)}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </Card>
      );
    }
    return (
      <>
        <Card className={`overflow-hidden ${className} p-4 hover:shadow-md transition-all`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">PDF Document</p>
              <p className="text-xs text-muted-foreground">Preview in-app, or open / download</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setPdfPreviewOpen(true)}
              >
                <Eye className="h-4 w-4" />
                Preview
              </Button>
              <Button
                variant="default"
                size="sm"
                className="gap-1"
                asChild
              >
                <a href={encodedUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open
                </a>
              </Button>
            </div>
          </div>
        </Card>
        <Dialog open={pdfPreviewOpen} onOpenChange={(open) => {
          setPdfPreviewOpen(open);
          if (!open) {
            setPdfBlocked(false);
            if (pdfBlobUrl) {
              URL.revokeObjectURL(pdfBlobUrl);
              setPdfBlobUrl(null);
            }
          }
        }}>
          <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] p-0 bg-background border-none flex flex-col">
            <div className="flex items-center justify-between p-3 border-b">
              <p className="text-sm font-medium truncate">PDF Preview</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild className="gap-1">
                  <a href={encodedUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPdfPreviewOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
            {pdfBlocked && !pdfBlobUrl ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 bg-muted/30">
                <ShieldAlert className="h-12 w-12 text-amber-500" />
                <div className="text-center max-w-md space-y-2">
                  <p className="font-medium">Preview blocked by your browser</p>
                  <p className="text-sm text-muted-foreground">
                    An ad blocker or privacy extension (uBlock, Brave Shields, AdBlock, etc.) is blocking <code className="text-xs">archive.org</code>. You can load the document through our proxy instead.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => loadProxyBlob('pdf')}
                    disabled={pdfProxying}
                    className="gap-2"
                  >
                    {pdfProxying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {pdfProxying ? 'Loading...' : 'Load via proxy'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setPdfBlocked(false); setPdfProbeKey(k => k + 1); }}
                  >
                    Try again
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center max-w-md">
                  Tip: whitelist this site in your ad blocker to load PDFs directly.
                </p>
              </div>
            ) : (
              <iframe
                key={pdfBlobUrl || encodedUrl}
                src={pdfBlobUrl || encodedUrl}
                title="PDF preview"
                className="flex-1 w-full"
                onLoad={() => setPdfBlocked(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      </>
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
            <ShieldAlert className="h-8 w-8 text-amber-500" />
            <div className="text-center">
              <p className="text-sm font-medium">Image couldn't be loaded</p>
              <p className="text-xs text-muted-foreground">It may still be uploading, or your ad blocker is blocking archive.org. Try the proxy.</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => loadProxyBlob('image')}
                disabled={imageProxying}
                className="gap-2"
              >
                {imageProxying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Load via proxy
              </Button>
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
            </div>
          </Card>
        )}
        
        {/* Actual image - hidden when loading or error */}
        <Card 
          className={`overflow-hidden ${className} cursor-pointer hover:shadow-lg transition-all border-border`}
          onClick={() => setImageZoomOpen(true)}
          style={{ display: imageLoading || imageError ? 'none' : 'block' }}
        >
          <img 
            src={imageBlobUrl || encodedUrl} 
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
                src={imageBlobUrl || encodedUrl} 
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
