import React, { useState, useMemo } from 'react';
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
import { useUploadManager } from '@/contexts/UploadManagerContext';

const questionSchema = z.object({
  question: z.string().min(10, 'Question must be at least 10 characters').max(500, 'Question must be less than 500 characters'),
  book: z.string().max(200).optional(),
});

type QuestionFormData = z.infer<typeof questionSchema>;

interface EditQuestionFormProps {
  questionId: number;
  chapterId: number;
  initialData: string;
  initialBook?: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const EditQuestionForm: React.FC<EditQuestionFormProps> = ({ 
  questionId,
  chapterId,
  initialData,
  initialBook,
  onSuccess, 
  onCancel 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { getUploadsByCallback } = useUploadManager();
  
  // Generate stable callback ID for tracking uploads
  const callbackId = useMemo(() => `edit-question-${Date.now()}`, []);
  
  // Check for pending uploads
  const myUploads = getUploadsByCallback(callbackId);
  const hasPendingUploads = myUploads.some(u => u.status === 'queued' || u.status === 'uploading');
  
  // Parse initial data to separate text from URLs
  const parseQuestionData = (data: string) => {
    const urlPattern = /https?:\/\/[^\s]+/g;
    const urls = data.match(urlPattern) || [];
    const text = data.replace(/\n\nAttachments:\n.*$/s, '').trim();
    return { text, urls };
  };
  
  const { text: initialText, urls: initialUrls } = parseQuestionData(initialData);
  const [mediaUrls, setMediaUrls] = useState<string[]>(initialUrls);
  
  const form = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      question: initialText,
      book: initialBook || '',
    },
  });

  const handleMediaUploaded = (url: string, type: 'image' | 'video' | 'audio' | 'pdf') => {
    setMediaUrls(prev => [...prev, url]);
    toast.success('Media added successfully');
  };

  const removeMedia = (index: number) => {
    setMediaUrls(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: QuestionFormData) => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please login to edit question');
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

      const { error } = await supabase
        .from('questions')
        .update({
          data: questionData,
          type_id: typeId,
          book: data.book || null,
        })
        .eq('id', questionId);

      if (error) throw error;

      toast.success('Question updated successfully');
      onSuccess();
    } catch (error) {
      console.error('Error updating question:', error);
      toast.error('Failed to update question');
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
              <FormLabel>Your Question</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Ask your question here..."
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
              <FormLabel>Book (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="📘 e.g. CMS / CLS / Manuel scolaire" {...field} />
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
            chapterId={chapterId}
            contentType="question"
            contentId={questionId.toString()}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || hasPendingUploads}>
            {(isSubmitting || hasPendingUploads) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hasPendingUploads ? 'Uploading...' : 'Update Question'}
          </Button>
        </div>
      </form>
    </Form>
  );
};
