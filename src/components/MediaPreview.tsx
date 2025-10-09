import { Card } from '@/components/ui/card';
import { AudioPlayer } from '@/components/AudioPlayer';

interface MediaPreviewProps {
  url: string;
  className?: string;
}

function extractRecordingNumber(url: string): string | undefined {
  const match = url.match(/recording-(\d+)/);
  return match ? match[1] : undefined;
}

export function MediaPreview({ url, className = '' }: MediaPreviewProps) {
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

  // Check if it's a PDF
  const isPdf = url.toLowerCase().includes('.pdf') || url.includes('pdf');

  // Check if it's an image
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url) || url.includes('image');

  // Check if it's an audio file
  const isAudio = /\.(mp3|wav|webm|ogg|m4a)$/i.test(url) || url.includes('audio');

  if (youtubeEmbedUrl) {
    return (
      <Card className={`overflow-hidden ${className}`}>
        <div className="aspect-video w-full">
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
    return (
      <Card className={`overflow-hidden ${className} p-6`}>
        <div className="flex flex-col items-center gap-4">
          <div className="text-6xl">📄</div>
          <div className="text-center space-y-2">
            <h3 className="font-semibold text-lg">PDF Document</h3>
            <p className="text-sm text-muted-foreground">Click below to view the PDF</p>
          </div>
          <div className="flex gap-2 w-full justify-center">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Open PDF in New Tab
            </a>
            <a
              href={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
            >
              View in Google Docs
            </a>
          </div>
        </div>
      </Card>
    );
  }

  if (isImage) {
    return (
      <Card className={`overflow-hidden ${className}`}>
        <img src={url} alt="Media content" className="w-full h-auto object-contain max-h-[600px]" />
      </Card>
    );
  }

  if (isAudio) {
    const recordingNumber = extractRecordingNumber(url);
    return (
      <AudioPlayer 
        url={url} 
        recordingNumber={recordingNumber}
        className={className}
      />
    );
  }

  return null;
}
