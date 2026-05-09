import React from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  pageCount?: number | null;
  className?: string;
}

/**
 * Compact "X pages" pill. Hidden when page count is null/undefined/0.
 */
export const PageCountBadge: React.FC<Props> = ({ pageCount, className }) => {
  if (pageCount == null || pageCount <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium',
        className,
      )}
      title={`${pageCount} page${pageCount === 1 ? '' : 's'}`}
    >
      <FileText className="w-3 h-3" />
      {pageCount}
      <span className="hidden sm:inline">{pageCount === 1 ? ' page' : ' pages'}</span>
    </span>
  );
};

export default PageCountBadge;