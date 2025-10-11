import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { calculateNextReview } from '@/hooks/useSpacedRepetition';
import { MediaPreview } from './MediaPreview';

interface StudySessionDialogProps {
  memorizationId: number;
  onClose: () => void;
}

interface Flashcard {
  id: number;
  front_data: { text: string; media?: string[] };
  back_data: { text: string; media?: string[] };
  order_index: number;
}

interface FlashcardReview {
  ease_factor: number;
  interval: number;
  review_count: number;
  next_review_date: string;
}

export const StudySessionDialog = ({ memorizationId, onClose }: StudySessionDialogProps) => {
  const { t } = useTranslation();
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [studying, setStudying] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0 });

  useEffect(() => {
    fetchFlashcards();
  }, [memorizationId]);

  const fetchFlashcards = async () => {
    try {
      const { data, error } = await supabase
        .from('flashcards')
        .select('*')
        .eq('memorization_id', memorizationId)
        .eq('deleted', false)
        .order('order_index');

      if (error) throw error;

      // Shuffle flashcards for study session and cast types
      const shuffled = [...(data || [])].sort(() => Math.random() - 0.5).map(card => ({
        ...card,
        front_data: card.front_data as { text: string; media?: string[] },
        back_data: card.back_data as { text: string; media?: string[] },
      }));
      setFlashcards(shuffled);
      setLoading(false);
    } catch (error: any) {
      console.error('Error fetching flashcards:', error);
      toast.error('Failed to load flashcards');
      setLoading(false);
    }
  };

  const handleRating = async (quality: number) => {
    if (currentIndex >= flashcards.length) return;

    setStudying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const currentCard = flashcards[currentIndex];

      // Get existing review or create defaults
      const { data: existingReview } = await supabase
        .from('flashcard_reviews')
        .select('*')
        .eq('user_id', user.id)
        .eq('flashcard_id', currentCard.id)
        .maybeSingle();

      const review: FlashcardReview = existingReview || {
        ease_factor: 2.5,
        interval: 0,
        review_count: 0,
        next_review_date: new Date().toISOString(),
      };

      // Calculate next review using SM-2 algorithm
      const { newEaseFactor, newInterval, nextReviewDate } = calculateNextReview(
        quality,
        review.ease_factor,
        review.interval,
        review.review_count
      );

      // Update or insert review
      await supabase
        .from('flashcard_reviews')
        .upsert({
          user_id: user.id,
          flashcard_id: currentCard.id,
          memorization_id: memorizationId,
          quality,
          ease_factor: newEaseFactor,
          interval: newInterval,
          next_review_date: nextReviewDate.toISOString(),
          review_count: review.review_count + 1,
        });

      // Update stats
      if (quality >= 3) {
        setSessionStats(s => ({ ...s, correct: s.correct + 1 }));
      } else {
        setSessionStats(s => ({ ...s, incorrect: s.incorrect + 1 }));
      }

      // Move to next card
      if (currentIndex < flashcards.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setShowBack(false);
      } else {
        // Session complete
        toast.success(`${t('sessionComplete')} ${sessionStats.correct + (quality >= 3 ? 1 : 0)} ${t('correct')}, ${sessionStats.incorrect + (quality < 3 ? 1 : 0)} ${t('toReview')}`);
        onClose();
      }
    } catch (error: any) {
      console.error('Error saving review:', error);
      toast.error('Failed to save review');
    } finally {
      setStudying(false);
    }
  };

  if (loading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <div className="text-center py-12 text-sm">{t('loadingFlashcards')}</div>
        </DialogContent>
      </Dialog>
    );
  }

  if (flashcards.length === 0) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground mb-4">{t('noFlashcardsAvailable')}</p>
            <Button onClick={onClose}>{t('close')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const currentCard = flashcards[currentIndex];
  const progress = ((currentIndex + 1) / flashcards.length) * 100;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 sm:h-10 sm:w-10">
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
            <div className="text-xs sm:text-sm text-muted-foreground">
              Card {currentIndex + 1} of {flashcards.length}
            </div>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 sm:h-2">
            <div
              className="bg-gradient-to-r from-pink-500 to-primary h-1.5 sm:h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Card Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          <Card className="p-4 sm:p-6 min-h-[250px] sm:min-h-[300px] flex flex-col justify-center items-center text-center">
            {!showBack ? (
              <div className="space-y-3 sm:space-y-4 w-full">
                <h3 className="text-lg sm:text-xl font-bold text-muted-foreground mb-3 sm:mb-4">{t('front')}</h3>
                {currentCard.front_data.text && (
                  <p className="text-sm sm:text-lg whitespace-pre-wrap">{currentCard.front_data.text}</p>
                )}
                {currentCard.front_data.media && currentCard.front_data.media.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {currentCard.front_data.media.map((url, idx) => (
                      <MediaPreview key={idx} url={url} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4 w-full">
                <h3 className="text-lg sm:text-xl font-bold text-primary mb-3 sm:mb-4">{t('back')}</h3>
                {currentCard.back_data.text && (
                  <p className="text-sm sm:text-lg whitespace-pre-wrap">{currentCard.back_data.text}</p>
                )}
                {currentCard.back_data.media && currentCard.back_data.media.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {currentCard.back_data.media.map((url, idx) => (
                      <MediaPreview key={idx} url={url} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Actions */}
        <div className="border-t p-3 sm:p-4">
          {!showBack ? (
            <Button
              onClick={() => setShowBack(true)}
              className="w-full gap-1.5 sm:gap-2 text-sm sm:text-base"
              size="lg"
            >
              <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
              {t('showAnswer')}
            </Button>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              <p className="text-xs sm:text-sm text-center text-muted-foreground mb-2">{t('howWellKnow')}</p>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <Button
                  onClick={() => handleRating(1)}
                  disabled={studying}
                  variant="destructive"
                  className="gap-1.5 sm:gap-2 text-xs sm:text-sm h-9 sm:h-10"
                >
                  <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                  {t('again')}
                </Button>
                <Button
                  onClick={() => handleRating(3)}
                  disabled={studying}
                  variant="outline"
                  className="gap-1.5 sm:gap-2 text-xs sm:text-sm h-9 sm:h-10"
                >
                  {t('hard')}
                </Button>
                <Button
                  onClick={() => handleRating(4)}
                  disabled={studying}
                  variant="outline"
                  className="gap-1.5 sm:gap-2 text-xs sm:text-sm h-9 sm:h-10"
                >
                  {t('good')}
                </Button>
                <Button
                  onClick={() => handleRating(5)}
                  disabled={studying}
                  className="gap-1.5 sm:gap-2 text-xs sm:text-sm h-9 sm:h-10 bg-gradient-to-r from-green-500 to-emerald-500"
                >
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                  {t('easy')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
