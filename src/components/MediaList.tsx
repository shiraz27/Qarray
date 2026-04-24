import React from 'react';
import { MediaPreview } from './MediaPreview';
import { extractMediaFromText } from '@/utils/mediaHelpers';
import { capitalizeEveryWord } from '@/utils/textHelpers';

interface MediaListProps {
  data: string;
  showText?: boolean;
  capitalizeText?: boolean;
}

export function MediaList({ data, showText = true, capitalizeText = false }: MediaListProps) {
  const { text, media } = extractMediaFromText(data);

  return (
    <div className="space-y-4">
      {showText && text && (
        <p className="text-base leading-relaxed">{capitalizeText ? capitalizeEveryWord(text) : text}</p>
      )}
      
      {media.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Attachments ({media.length})
          </h3>
          <div className="grid grid-cols-1 gap-4">
            {media.map((file, index) => (
              <div key={index} className="w-full">
                <MediaPreview url={file.url} className="w-full" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
