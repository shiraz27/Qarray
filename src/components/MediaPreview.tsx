import { Card } from '@/components/ui/card';

interface MediaPreviewProps {
  url: string;
  className?: string;
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
      <Card className={`overflow-hidden ${className}`}>
        <iframe
          src={`${url}#view=FitH`}
          width="100%"
          height="500"
          title="PDF viewer"
          className="w-full border-0"
        />
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
    return (
      <Card className={`p-4 ${className}`}>
        <audio controls className="w-full">
          <source src={url} type="audio/mpeg" />
          <source src={url} type="audio/webm" />
          <source src={url} type="audio/wav" />
          Your browser does not support the audio element.
        </audio>
      </Card>
    );
  }

  return null;
}
