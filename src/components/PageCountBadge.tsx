import React from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface Props {
  pageCount?: number | null;
  className?: string;
}

/**
 * Compact "X pages" pill. Hidden when page count is null/undefined/0.
 */
export const PageCountBadge: React.FC<Props> = ({ pageCount, className }) => {
  const { t } = useTranslation();
  if (pageCount == null || pageCount <= 0) return null;
  const label = pageCount === 1 ? t('page') : t('pages');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium',
        className,
      )}
      title={`${pageCount} ${label}`}
    >
      <FileText className="w-3 h-3" />
      {pageCount}
      <span>{` ${label}`}</span>
    </span>
  );
};

export default PageCountBadge;