import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import tutorialWelcome from '@/assets/tutorial-welcome.jpg';
import tutorialSubjects from '@/assets/tutorial-subjects.jpg';
import tutorialQuestions from '@/assets/tutorial-questions.jpg';
import tutorialFlashcards from '@/assets/tutorial-flashcards.jpg';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';


interface TutorialDialogProps {
  open: boolean;
  onClose: () => void;
  initialStep?: number;
}

interface TutorialStep {
  title: string;
  description: string;
  image: string;
}

export const TutorialDialog = ({ open, onClose, initialStep = 0 }: TutorialDialogProps) => {
  const { t } = useTranslation();
  const { enabled: tutorialEnabled, loading: tutorialLoading } = useFeatureFlag('tutorial');

  const [currentStep, setCurrentStep] = useState(initialStep);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    if (tutorialLoading) return;
    if (tutorialEnabled === false) return;

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, [tutorialLoading, tutorialEnabled]);


  const steps: TutorialStep[] = [
    {
      title: t('tutorialWelcomeTitle') || 'Welcome to Qarray! 👋',
      description: t('tutorialWelcomeDesc') || 'Your ultimate learning companion for high school studies. Let\'s take a quick tour to help you get started!',
      image: tutorialWelcome,
    },
    {
      title: t('tutorialSubjectsTitle') || 'Subjects & Chapters 📚',
      description: t('tutorialSubjectsDesc') || 'Browse through your subjects and chapters. Each chapter contains questions, answers, resources, and study materials organized for easy learning.',
      image: tutorialSubjects,
    },
    {
      title: t('tutorialQuestionsTitle') || 'Ask & Answer Questions 💬',
      description: t('tutorialQuestionsDesc') || 'Have a question? Ask it in any chapter! You can also help others by answering their questions. Collaborate and learn together with your classmates.',
      image: tutorialQuestions,
    },
    {
      title: t('tutorialFlashcardsTitle') || 'Memorization Sets 🧠',
      description: t('tutorialFlashcardsDesc') || 'Create flashcard sets to memorize important concepts. Use spaced repetition to study efficiently and retain information longer.',
      image: tutorialFlashcards,
    },
  ];

  const handleNext = async () => {
    if (currentStep < steps.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      await updateTutorialProgress(nextStep, false);
    } else {
      await handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    await handleComplete();
  };

  const handleComplete = async () => {
    if (tutorialEnabled === false) return;
    if (!user) return;


    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          tutorial_completed: true,
          tutorial_step: steps.length,
        })
        .eq('user_id', user.id);

      if (error) throw error;
      
      toast.success(t('tutorialCompleted') || 'Tutorial completed!');
      onClose();
    } catch (error: any) {
      console.error('Error completing tutorial:', error);
      toast.error('Failed to save tutorial progress');
    }
  };

  const updateTutorialProgress = async (step: number, completed: boolean) => {
    if (tutorialEnabled === false) return;
    if (!user) return;


    try {
      await supabase
        .from('profiles')
        .update({
          tutorial_step: step,
          tutorial_completed: completed,
        })
        .eq('user_id', user.id);
    } catch (error: any) {
      console.error('Error updating tutorial progress:', error);
    }
  };

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  if (tutorialLoading || tutorialEnabled === false) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>

      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          {/* Image */}
          <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-muted">
            <img
              src={currentStepData.image}
              alt={currentStepData.title}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Text content */}
          <div className="space-y-3 text-center">
            <h2 className="text-2xl font-bold">{currentStepData.title}</h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              {currentStepData.description}
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex justify-center gap-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all ${
                  index === currentStep
                    ? 'w-8 bg-primary'
                    : index < currentStep
                    ? 'w-2 bg-primary/50'
                    : 'w-2 bg-muted'
                }`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex justify-between gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className="gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              {t('previous') || 'Previous'}
            </Button>

            <Button onClick={handleNext} className="gap-2">
              {currentStep === steps.length - 1 ? (
                t('getStarted') || 'Get Started'
              ) : (
                <>
                  {t('next') || 'Next'}
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>

          {/* Skip button */}
          {currentStep < steps.length - 1 && (
            <div className="text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="text-muted-foreground"
              >
                {t('skipTutorial') || 'Skip tutorial'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
