import React, { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { MediaUploader } from './MediaUploader';
import { useUserRole } from '@/hooks/useUserRole';
import { useUploadManager } from '@/contexts/UploadManagerContext';
import { useTranslation } from 'react-i18next';

const answerSchema = z.object({
  answer: z.string().min(10, 'Answer must be at least 10 characters').max(1000, 'Answer must be less than 1000 characters'),
});

type AnswerFormData = z.infer<typeof answerSchema>;

interface AnswerQuestionFormProps {
  questionId: number;
  chapterId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export const AnswerQuestionForm: React.FC<AnswerQuestionFormProps> = ({ 
  questionId,
  chapterId,
  onSuccess, 
  onCancel 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const { isModerator, isAdmin } = useUserRole();
  const { getUploadsByCallback } = useUploadManager();
  const { t } = useTranslation();
  const { t: tf } = useTranslation('forms');
  
  // Generate stable callback ID for tracking uploads
  const callbackId = useMemo(() => `answer-${Date.now()}`, []);
  
  // Check for pending uploads
  const myUploads = getUploadsByCallback(callbackId);
  const hasPendingUploads = myUploads.some(u => u.status === 'queued' || u.status === 'uploading');
  
  const form = useForm<AnswerFormData>({
    resolver: zodResolver(answerSchema),
    defaultValues: {
      answer: '',
    },
  });

  const handleMediaUploaded = (url: string, type: 'image' | 'video' | 'audio' | 'pdf') => {
    setMediaUrls(prev => [...prev, url]);
    toast.success(tf('media.added'));
  };

  const removeMedia = (index: number) => {
    setMediaUrls(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: AnswerFormData) => {
    if (hasPendingUploads) {
      toast.warning(tf('uploads.waitForCompletion'));
      return;
    }
    
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error(tf('answer.loginRequired'));
        return;
      }

      // Combine answer text with media URLs
      const answerData = mediaUrls.length > 0 
        ? `${data.answer}\n\nAttachments:\n${mediaUrls.join('\n')}`
        : data.answer;

      const { error } = await supabase
        .from('answers')
        .insert({
          question_id: questionId,
          data: answerData,
          contributors: [user.id],
          verified: isModerator || isAdmin,
        });

      if (error) throw error;

      toast.success(tf('answer.submitted'));
      form.reset();
      setMediaUrls([]);
      onSuccess();
    } catch (error) {
      console.error('Error submitting answer:', error);
      toast.error(tf('answer.submitFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="answer"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{tf('answer.label')}</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder={tf('answer.placeholder')}
                  className="min-h-32 resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <FormLabel>{tf('attachments.optional')}</FormLabel>
          <MediaUploader 
            onMediaUploaded={handleMediaUploaded}
            uploadedMedia={mediaUrls.map(url => ({ url, type: 'mixed', name: url }))}
            onRemoveMedia={removeMedia}
            chapterId={chapterId}
            contentType="answer"
            contentId={questionId.toString()}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting || hasPendingUploads}>
            {(isSubmitting || hasPendingUploads) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hasPendingUploads ? tf('uploads.inProgress') : tf('answer.submit')}
          </Button>
        </div>
      </form>
    </Form>
  );
};
