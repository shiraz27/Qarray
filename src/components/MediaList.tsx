import React from 'react';
import { MediaPreview } from './MediaPreview';
import { extractMediaFromText } from '@/utils/mediaHelpers';

interface MediaListProps {
  data: string;
  showText?: boolean;
}

export function MediaList({ data, showText = true }: MediaListProps) {
  const { text, media } = extractMediaFromText(data);

  return (
    <div className="space-y-4">
      {showText && text && (
        <p className="text-base leading-relaxed">{text}</p>
      )}
      
      {media.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Attachments ({media.length})
          </h3>
          <div className="flex flex-wrap gap-3">
            {media.map((file, index) => (
              <div key={index} className="w-64">
                <MediaPreview url={file.url} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
