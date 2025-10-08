import React from 'react';
import { FileQuestion, Package, Bookmark } from 'lucide-react';

interface EmptyStateProps {
  type: 'questions' | 'resources' | 'bookmarks' | 'chapters';
  message: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ type, message }) => {
  const getIcon = () => {
    switch (type) {
      case 'questions':
        return <FileQuestion size={80} className="text-muted-foreground/40" strokeWidth={1} />;
      case 'resources':
        return <Package size={80} className="text-muted-foreground/40" strokeWidth={1} />;
      case 'bookmarks':
        return <Bookmark size={80} className="text-muted-foreground/40" strokeWidth={1} />;
      case 'chapters':
        return <Package size={80} className="text-muted-foreground/40" strokeWidth={1} />;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="mb-4 relative">
        <div className="absolute inset-0 bg-muted/20 rounded-full blur-2xl" />
        <div className="relative">{getIcon()}</div>
      </div>
      <p className="text-center text-muted-foreground text-sm max-w-xs">
        {message}
      </p>
    </div>
  );
};
