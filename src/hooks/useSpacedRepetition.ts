import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';


// SuperMemo SM-2 algorithm implementation
export const calculateNextReview = (
  quality: number, // 0-5 rating
  easeFactor: number,
  interval: number,
  reviewCount: number
): { newEaseFactor: number; newInterval: number; nextReviewDate: Date } => {
  let newEaseFactor = easeFactor;
  let newInterval = interval;

  // Update ease factor
  newEaseFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  // Calculate new interval
  if (quality < 3) {
    // Failed - restart
    newInterval = 0;
  } else {
    if (reviewCount === 0) {
      newInterval = 1;
    } else if (reviewCount === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * newEaseFactor);
    }
  }

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

  return { newEaseFactor, newInterval, nextReviewDate };
};

export const useSpacedRepetition = (memorizationId: number | null) => {
  const [dueReviews, setDueReviews] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const { enabled: featureEnabled, loading: featureLoading } = useFeatureFlag('memorizations');

  useEffect(() => {
    if (!memorizationId) {
      setDueReviews(0);
      setLoading(false);
      return;
    }

    if (featureLoading || featureEnabled === false) {
      setDueReviews(0);
      setLoading(false);
      return;
    }

    const fetchDueReviews = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setDueReviews(0);
        setLoading(false);
        return;
      }

      const { count } = await supabase
        .from('flashcard_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('memorization_id', memorizationId)
        .lte('next_review_date', new Date().toISOString());

      setDueReviews(count || 0);
      setLoading(false);
    };

    fetchDueReviews();
  }, [memorizationId, featureLoading, featureEnabled]);

  return { dueReviews, loading };
};

