import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock } from 'lucide-react';

interface VerifiedBadgeProps {
  verified: boolean;
  className?: string;
}

export const VerifiedBadge = ({ verified, className = '' }: VerifiedBadgeProps) => {
  if (verified) {
    return (
      <Badge variant="secondary" className={`gap-1 ${className}`}>
        <CheckCircle2 className="w-3 h-3" />
        Verified
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={`gap-1 ${className}`}>
      <Clock className="w-3 h-3" />
      Pending
    </Badge>
  );
};
