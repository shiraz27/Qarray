import React from 'react';
import { Share2 } from 'lucide-react';
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
  const { classes, subjects, chapters, destinations, loading } = useSharedWithSummary(sharedWith);
  if (!sharedWith || sharedWith.length === 0) return null;

  const textSize = size === 'xs' ? 'text-[10px]' : 'text-xs';
  const iconSize = size === 'xs' ? 10 : 12;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Show shared class, subject, and chapter destinations"
          className={`inline-flex h-5 items-center gap-1 rounded-full border border-transparent bg-secondary px-1.5 py-0 ${textSize} font-normal text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
        >
          <Share2 size={iconSize} />
          <span>
            {classes.length} {classes.length === 1 ? 'class' : 'classes'} ·{' '}
            {subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'} ·{' '}
            {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[32rem] max-w-[calc(100vw-2rem)] text-xs space-y-3 p-3" align="start">
        <TooltipProvider delayDuration={150}>
          <div>
            <div className="font-semibold mb-2">Shared with</div>
            {loading ? (
              <div className="text-muted-foreground">Loading shared destinations…</div>
            ) : destinations.length === 0 ? (
              <div className="text-muted-foreground">No shared destinations found.</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {destinations.map((destination) => (
                  <Tooltip key={destination.chapterId}>
                    <TooltipTrigger asChild>
                      <div className="rounded-md border border-border bg-background/60 px-2 py-1.5 leading-relaxed">
                        <div className="font-medium break-words">Class: {destination.className}</div>
                        <div className="text-muted-foreground break-words">Subject: {destination.subjectName}</div>
                        <div className="text-muted-foreground break-words">Chapter: {destination.chapterName}</div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
                      <div>Class: {destination.className}</div>
                      <div>Subject: {destination.subjectName}</div>
                      <div>Chapter: {destination.chapterName}</div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>
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