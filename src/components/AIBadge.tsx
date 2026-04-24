import React from 'react';
import { Bot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Small badge that signals an AI-suggested value. Wrapped in a tooltip that
 * makes it explicit the field is still editable, so users don't assume the
 * suggestion is locked.
 */
export const AIBadge: React.FC<{ label?: string; className?: string }> = ({
  label = 'AI',
  className,
}) => (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          className={`text-xs cursor-help ${className ?? ''}`}
        >
          <Bot className="h-3 w-3 mr-1" />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top">
        AI-suggested — you can edit
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);