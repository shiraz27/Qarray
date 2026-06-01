import React, { useState, useMemo, useEffect } from 'react';
import { BookAutocomplete } from "@/components/BookAutocomplete";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { MediaUploader } from './MediaUploader';
import { useUserRole } from '@/hooks/useUserRole';
import { useUploadManager } from '@/contexts/UploadManagerContext';
import { computePageCountFromUrls } from '@/utils/pageCountHelpers';
import { useTranslation } from 'react-i18next';

const questionSchema = z.object({
  question: z.string().min(10, 'Question must be at least 10 characters').max(500, 'Question must be less than 500 characters'),
  book: z.string().max(200).optional(),
});

type QuestionFormData = z.infer<typeof questionSchema>;

interface AskQuestionFormProps {
  chapterId: number;
  resourceTypes: Array<{ id: number; type: string }>;
  onSuccess: () => void;
  onCancel: () => void;
  resourceId?: number;
}

export const AskQuestionForm: React.FC<AskQuestionFormProps> = ({ 
  chapterId, 
  resourceTypes,
  onSuccess, 
  onCancel,
  resourceId
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const { isModerator, isAdmin } = useUserRole();
  const { getUploadsByCallback } = useUploadManager();
  const { t } = useTranslation();
  const { t: tf } = useTranslation('forms');
  
  // Generate stable callback ID for tracking uploads
  const callbackId = useMemo(() => `ask-question-${Date.now()}`, []);
  
  // Check for pending uploads
  const myUploads = getUploadsByCallback(callbackId);
  const hasPendingUploads = myUploads.some(u => u.status === 'queued' || u.status === 'uploading');
  
  const form = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      question: '',
      book: '',
    },
  });

  const handleMediaUploaded = (url: string, type: 'image' | 'video' | 'audio' | 'pdf') => {
    setMediaUrls(prev => [...prev, url]);
    toast.success(tf('media.added'));
  };

  const removeMedia = (index: number) => {
    setMediaUrls(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: QuestionFormData) => {
    if (hasPendingUploads) {
      toast.warning(tf('uploads.waitForCompletion'));
      return;
    }
    
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error(tf('question.loginRequired'));
        setIsSubmitting(false);
        return;
      }

      // Combine question text with media URLs
      const questionData = mediaUrls.length > 0 
        ? `${data.question}\n\nAttachments:\n${mediaUrls.join('\n')}`
        : data.question;

      // Auto-detect type based on media
      let typeId = 1; // Default type
      if (mediaUrls.length > 0) {
        const firstUrl = mediaUrls[0].toLowerCase();
        if (firstUrl.includes('youtube') || firstUrl.includes('youtu.be')) {
          typeId = 2; // Video type
        } else if (firstUrl.includes('.pdf')) {
          typeId = 3; // Document type
        } else if (firstUrl.includes('archive.org') && firstUrl.includes('audio')) {
          typeId = 4; // Audio type
        }
      }

      console.log('Submitting question with:', { 
        chapter_id: chapterId, 
        resource_id: resourceId || null,
        user_id: user.id 
      });

      const { data: insertedData, error } = await supabase
        .from('questions')
        .insert({
          chapter_id: chapterId,
          resource_id: resourceId || null,
          data: questionData,
          type_id: typeId,
          contributors: [user.id],
          verified: isModerator || isAdmin,
          book: data.book || null,
          books: data.book ? [data.book] : [],
          page_count: await computePageCountFromUrls(mediaUrls).then(r => r.complete ? r.count : null).catch(() => null),
        })
        .select();

      if (error) {
        console.error('Insert error:', error);
        throw error;
      }

      console.log('Question inserted successfully:', insertedData);
      toast.success(tf('question.submitted'));
      form.reset();
      setMediaUrls([]);
      onSuccess();
    } catch (error) {
      console.error('Error submitting question:', error);
      toast.error(tf('question.submitFailed', { error: error instanceof Error ? error.message : 'Unknown error' }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="question"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{tf('question.label')}</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder={tf('question.placeholder')}
                  className="min-h-32 resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="book"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{tf('question.bookOptional')}</FormLabel>
              <FormControl>
                <BookAutocomplete value={field.value || ""} onChange={field.onChange} source="question" />
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
            contentType="question"
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting || hasPendingUploads}>
            {(isSubmitting || hasPendingUploads) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hasPendingUploads ? tf('uploads.inProgress') : tf('question.submit')}
          </Button>
        </div>
      </form>
    </Form>
  );
};
