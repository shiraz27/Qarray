import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { MediaPreview } from './MediaPreview';
import { extractMediaFromText } from '@/utils/mediaHelpers';

interface MediaListProps {
  data: string;
  showText?: boolean;
}

export function MediaList({ data, showText = true }: MediaListProps) {
  const { text, media } = extractMediaFromText(data);
  
  // Filter out archive.org URLs - we'll just show file type indicators
  const nonArchiveMedia = media.filter(file => !file.url.includes('archive.org'));

  return (
    <div className="space-y-4">
      {showText && text && (
        <p className="text-base leading-relaxed">{text}</p>
      )}
      
      {nonArchiveMedia.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Attachments ({nonArchiveMedia.length})
          </h3>
          {nonArchiveMedia.map((file, index) => (
            <div key={index} className="space-y-2">
              {/* Only show file card with external link for PDFs */}
              {file.type === 'pdf' && (
                <Card className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium flex-1">{file.displayName}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(file.url, '_blank')}
                    >
                      <ExternalLink size={16} />
                    </Button>
                  </div>
                </Card>
              )}
              {/* Show label for non-PDF media */}
              {file.type !== 'pdf' && (
                <div className="text-sm font-medium text-muted-foreground">
                  {file.displayName}
                </div>
              )}
              <MediaPreview url={file.url} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
