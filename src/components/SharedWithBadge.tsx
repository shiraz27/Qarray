import React from 'react';
import { Share2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSharedWithSummary } from '@/hooks/useSharedWithSummary';

interface Props {
  sharedWith: number[] | null | undefined;
  size?: 'xs' | 'sm';
}

/**
 * Tiny read-only badge shown on resources that are also shared into other
 * chapters. Counts distinct destination classes/subjects (not chapter names).
 */
export const SharedWithBadge: React.FC<Props> = ({ sharedWith, size = 'xs' }) => {
  const { classes, subjects, chapters } = useSharedWithSummary(sharedWith);
  if (!sharedWith || sharedWith.length === 0) return null;

  const textSize = size === 'xs' ? 'text-[10px]' : 'text-xs';
  const iconSize = size === 'xs' ? 10 : 12;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant="secondary"
          className={`gap-1 px-1.5 py-0 h-5 ${textSize} font-normal cursor-pointer`}
        >
          <Share2 size={iconSize} />
          <span>
            {classes.length} {classes.length === 1 ? 'class' : 'classes'} ·{' '}
            {subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'} ·{' '}
            {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}
          </span>
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs space-y-3 p-3" align="start">
        <TooltipProvider delayDuration={150}>
          <Section title="Classes" items={classes} />
          <Section title="Subjects" items={subjects} />
          <Section title="Chapters" items={chapters} />
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
};

const Section: React.FC<{ title: string; items: { id: number; name: string }[] }> = ({
  title,
  items,
}) => (
  <div>
    <div className="font-semibold mb-1">
      {title} {items.length > 0 && <span className="text-muted-foreground">({items.length})</span>}
    </div>
    {items.length === 0 ? (
      <div className="text-muted-foreground">—</div>
    ) : (
      <div className="flex flex-wrap gap-1">
        {items.map((it) => (
          <Tooltip key={it.id}>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="text-[10px] font-normal max-w-[200px] truncate"
                title={it.name}
              >
                {it.name}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {it.name}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    )}
  </div>
);