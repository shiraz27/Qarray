import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { MediaUploader } from './MediaUploader';

const questionSchema = z.object({
  question: z.string().min(10, 'Question must be at least 10 characters').max(500, 'Question must be less than 500 characters'),
  type_id: z.string().min(1, 'Please select a question type'),
});

type QuestionFormData = z.infer<typeof questionSchema>;

interface AskQuestionFormProps {
  chapterId: number;
  resourceTypes: Array<{ id: number; type: string }>;
  onSuccess: () => void;
  onCancel: () => void;
}

export const AskQuestionForm: React.FC<AskQuestionFormProps> = ({ 
  chapterId, 
  resourceTypes,
  onSuccess, 
  onCancel 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  
  const form = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      question: '',
      type_id: '',
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
        toast.error('Please login to ask a question');
        return;
      }

      // Combine question text with media URLs
      const questionData = mediaUrls.length > 0 
        ? `${data.question}\n\nAttachments:\n${mediaUrls.join('\n')}`
        : data.question;

      const { error } = await supabase
        .from('questions')
        .insert({
          chapter_id: chapterId,
          data: questionData,
          type_id: parseInt(data.type_id),
          contributors: [user.id],
        });

      if (error) throw error;

      toast.success('Question submitted successfully');
      form.reset();
      setMediaUrls([]);
      onSuccess();
    } catch (error) {
      console.error('Error submitting question:', error);
      toast.error('Failed to submit question');
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
          name="type_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Question Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select question type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {resourceTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id.toString()}>
                      {type.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              {mediaUrls.map((url, index) => (
                <div key={index} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                  <span className="truncate flex-1">{url}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMedia(index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Question
          </Button>
        </div>
      </form>
    </Form>
  );
};
