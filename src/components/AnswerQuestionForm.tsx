import React, { useState } from 'react';
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

const answerSchema = z.object({
  answer: z.string().min(10, 'Answer must be at least 10 characters').max(1000, 'Answer must be less than 1000 characters'),
});

type AnswerFormData = z.infer<typeof answerSchema>;

interface AnswerQuestionFormProps {
  questionId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export const AnswerQuestionForm: React.FC<AnswerQuestionFormProps> = ({ 
  questionId, 
  onSuccess, 
  onCancel 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  
  const form = useForm<AnswerFormData>({
    resolver: zodResolver(answerSchema),
    defaultValues: {
      answer: '',
    },
  });

  const handleMediaUploaded = (url: string) => {
    setMediaUrls(prev => [...prev, url]);
    toast.success('Media added successfully');
  };

  const removeMedia = (index: number) => {
    setMediaUrls(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: AnswerFormData) => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please login to answer');
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
        });

      if (error) throw error;

      toast.success('Answer submitted successfully');
      form.reset();
      setMediaUrls([]);
      onSuccess();
    } catch (error) {
      console.error('Error submitting answer:', error);
      toast.error('Failed to submit answer');
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
              <FormLabel>Your Answer</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Write your answer here..."
                  className="min-h-32 resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <FormLabel>Attachments (Optional)</FormLabel>
          <MediaUploader onMediaUploaded={handleMediaUploaded} />
          
          {mediaUrls.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium">Added attachments:</p>
              {mediaUrls.map((url, index) => {
                let displayName = 'Attachment ' + (index + 1);
                if (url.includes('youtube.com') || url.includes('youtu.be')) {
                  displayName = '📹 YouTube Video';
                } else if (url.includes('.pdf')) {
                  displayName = '📄 PDF Document';
                } else if (url.includes('archive.org')) {
                  const urlParts = url.split('/');
                  const filename = urlParts[urlParts.length - 1];
                  if (filename.includes('recording-')) {
                    displayName = '🎤 Audio Recording';
                  } else if (filename.match(/\.(jpg|jpeg|png|webp)$/i)) {
                    displayName = '📷 Image';
                  } else {
                    displayName = '📎 ' + decodeURIComponent(filename);
                  }
                }
                
                return (
                  <div key={index} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                    <span className="truncate flex-1">{displayName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMedia(index)}
                    >
                      Remove
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Answer
          </Button>
        </div>
      </form>
    </Form>
  );
};
