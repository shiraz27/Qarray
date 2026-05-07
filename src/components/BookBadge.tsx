import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookBadgeProps {
  book?: string | null;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Small pill badge displaying the "book" metadata for a resource/question.
 * Renders nothing when book is empty.
 */
export const BookBadge: React.FC<BookBadgeProps> = ({ book, className, size = 'sm' }) => {
  if (!book || !book.trim()) return null;
  const sizeCls = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';
  return (
    <span
      title={book}
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium max-w-[16rem] truncate',
        'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-900 border border-amber-200/60',
        'dark:from-amber-900/40 dark:to-orange-900/40 dark:text-amber-100 dark:border-amber-700/40',
        sizeCls,
        className,
      )}
    >
      <BookOpen className={size === 'sm' ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} />
      <span className="truncate">{book}</span>
    </span>
  );
};

export default BookBadge;
