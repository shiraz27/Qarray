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

const questionSchema = z.object({
  question: z.string().min(10, 'Question must be at least 10 characters').max(500, 'Question must be less than 500 characters'),
});

type QuestionFormData = z.infer<typeof questionSchema>;

interface EditQuestionFormProps {
  questionId: number;
  initialData: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const EditQuestionForm: React.FC<EditQuestionFormProps> = ({ 
  questionId,
  initialData,
  onSuccess, 
  onCancel 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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
    },
  });

  const handleMediaUploaded = (url: string) => {
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
            Update Question
          </Button>
        </div>
      </form>
    </Form>
  );
};
