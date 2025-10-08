import React from 'react';
import { Card } from '@/components/ui/card';

export const ChapterSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <Card key={i} className="p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-3/4 mb-3" />
        <div className="flex gap-4">
          <div className="h-3 bg-muted rounded w-20" />
          <div className="h-3 bg-muted rounded w-20" />
        </div>
      </Card>
    ))}
  </div>
);

export const ContentSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3, 4].map((i) => (
      <Card key={i} className="p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-full mb-2" />
        <div className="h-3 bg-muted rounded w-2/3 mb-3" />
        <div className="flex justify-between items-center">
          <div className="h-3 bg-muted rounded w-24" />
          <div className="flex gap-2">
            <div className="h-6 bg-muted rounded w-12" />
            <div className="h-6 bg-muted rounded w-12" />
          </div>
        </div>
      </Card>
    ))}
  </div>
);

export const BookmarkSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <Card key={i} className="p-4 animate-pulse">
        <div className="h-3 bg-muted rounded w-20 mb-2" />
        <div className="h-4 bg-muted rounded w-3/4 mb-3" />
        <div className="flex gap-4">
          <div className="h-3 bg-muted rounded w-24" />
          <div className="h-3 bg-muted rounded w-24" />
        </div>
      </Card>
    ))}
  </div>
);
