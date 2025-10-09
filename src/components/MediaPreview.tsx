import { Card } from '@/components/ui/card';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Volume2 } from 'lucide-react';
import { useState } from 'react';
import { AudioPlayerModal } from '@/components/AudioPlayerModal';

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
    return (
      <Card className={`overflow-hidden ${className} p-4 hover:shadow-md transition-all cursor-pointer`}>
        <a
          href={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 text-sm"
        >
          <div className="text-3xl">📄</div>
          <div className="flex-1">
            <p className="font-medium">PDF Document</p>
            <p className="text-xs text-muted-foreground">Click to view</p>
          </div>
        </a>
      </Card>
    );
  }

  if (isImage) {
    return (
      <Card className={`overflow-hidden ${className}`}>
        <img src={url} alt="Media content" className="w-full h-auto object-cover max-h-40 rounded-lg" />
      </Card>
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
