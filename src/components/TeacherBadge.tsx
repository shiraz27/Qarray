import { GraduationCap, BadgeCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TeacherBadgeProps {
  verified: boolean;
  size?: 'sm' | 'md';
}

export const TeacherBadge = ({ verified, size = 'sm' }: TeacherBadgeProps) => {
  const iconSize = size === 'sm' ? 14 : 16;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-0.5 ml-1">
            <GraduationCap 
              size={iconSize} 
              className={verified ? 'text-primary' : 'text-muted-foreground'} 
            />
            {verified && (
              <BadgeCheck 
                size={iconSize - 2} 
                className="text-primary fill-primary" 
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{verified ? 'Verified Teacher' : 'Teacher (Not Verified)'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};