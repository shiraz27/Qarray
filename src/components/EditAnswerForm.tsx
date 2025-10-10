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

interface EditAnswerFormProps {
  answerId: number;
  initialData: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const EditAnswerForm: React.FC<EditAnswerFormProps> = ({ 
  answerId,
  initialData,
  onSuccess, 
  onCancel 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Parse initial data to separate text from URLs
  const parseAnswerData = (data: string) => {
    const urlPattern = /https?:\/\/[^\s]+/g;
    const urls = data.match(urlPattern) || [];
    const text = data.replace(/\n\nAttachments:\n.*$/s, '').trim();
    return { text, urls };
  };
  
  const { text: initialText, urls: initialUrls } = parseAnswerData(initialData);
  const [mediaUrls, setMediaUrls] = useState<string[]>(initialUrls);
  
  const form = useForm<AnswerFormData>({
    resolver: zodResolver(answerSchema),
    defaultValues: {
      answer: initialText,
    },
  });

  const handleMediaUploaded = (url: string, type: 'image' | 'video' | 'audio' | 'pdf') => {
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
        toast.error('Please login to edit answer');
        return;
      }

      // Combine answer text with media URLs
      const answerData = mediaUrls.length > 0 
        ? `${data.answer}\n\nAttachments:\n${mediaUrls.join('\n')}`
        : data.answer;

      const { error } = await supabase
        .from('answers')
        .update({
          data: answerData,
        })
        .eq('id', answerId);

      if (error) throw error;

      toast.success('Answer updated successfully');
      onSuccess();
    } catch (error) {
      console.error('Error updating answer:', error);
      toast.error('Failed to update answer');
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
                  placeholder="Edit your answer here..."
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
          <MediaUploader 
            onMediaUploaded={handleMediaUploaded}
            uploadedMedia={mediaUrls.map(url => ({ url, type: 'mixed', name: url }))}
            onRemoveMedia={removeMedia}
            onUploadStateChange={setIsUploading}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || isUploading}>
            {(isSubmitting || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isUploading ? 'Uploading...' : 'Update Answer'}
          </Button>
        </div>
      </form>
    </Form>
  );
};
