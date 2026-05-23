import React from 'react';
import { Share2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
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
  const { classes, subjects } = useSharedWithSummary(sharedWith);
  if (!sharedWith || sharedWith.length === 0) return null;

  const textSize = size === 'xs' ? 'text-[10px]' : 'text-xs';
  const iconSize = size === 'xs' ? 10 : 12;

  return (
    <HoverCard openDelay={120}>
      <HoverCardTrigger asChild>
        <Badge
          variant="secondary"
          className={`gap-1 px-1.5 py-0 h-5 ${textSize} font-normal cursor-help`}
        >
          <Share2 size={iconSize} />
          <span>
            {classes.length || '·'} cls · {subjects.length || '·'} subj
          </span>
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-64 text-xs space-y-2" align="start">
        <div>
          <div className="font-semibold mb-1">Shared with classes</div>
          {classes.length === 0 ? (
            <div className="text-muted-foreground">—</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {classes.map((c) => (
                <Badge key={c.id} variant="outline" className="text-[10px] font-normal">
                  {c.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="font-semibold mb-1">Subjects</div>
          {subjects.length === 0 ? (
            <div className="text-muted-foreground">—</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {subjects.map((s) => (
                <Badge key={s.id} variant="outline" className="text-[10px] font-normal">
                  {s.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};