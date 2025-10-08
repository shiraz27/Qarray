import React, { useState, useEffect } from 'react';
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
  subject_id: z.string().min(1, 'Please select a subject'),
  chapter_id: z.string().min(1, 'Please select a chapter'),
});

type QuestionFormData = z.infer<typeof questionSchema>;

interface Subject {
  id: number;
  name: string;
}

interface Chapter {
  id: number;
  name: string;
  subject_id: number;
}

interface AskQuestionFormWithSelectionProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const AskQuestionFormWithSelection: React.FC<AskQuestionFormWithSelectionProps> = ({ 
  onSuccess, 
  onCancel 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [filteredChapters, setFilteredChapters] = useState<Chapter[]>([]);
  
  const form = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      question: '',
      subject_id: '',
      chapter_id: '',
    },
  });

  const selectedSubjectId = form.watch('subject_id');

  useEffect(() => {
    fetchSubjects();
    fetchChapters();
  }, []);

  useEffect(() => {
    if (selectedSubjectId) {
      const filtered = chapters.filter(c => c.subject_id === parseInt(selectedSubjectId));
      setFilteredChapters(filtered);
      form.setValue('chapter_id', '');
    }
  }, [selectedSubjectId, chapters]);

  const fetchSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
    }
  };

  const fetchChapters = async () => {
    try {
      const { data, error } = await supabase
        .from('chapters')
        .select('id, name, subject_id')
        .order('name');
      
      if (error) throw error;
      setChapters(data || []);
    } catch (error) {
      console.error('Error fetching chapters:', error);
    }
  };

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
        setIsSubmitting(false);
        return;
      }

      const questionData = mediaUrls.length > 0 
        ? `${data.question}\n\nAttachments:\n${mediaUrls.join('\n')}`
        : data.question;

      let typeId = 1;
      if (mediaUrls.length > 0) {
        const firstUrl = mediaUrls[0].toLowerCase();
        if (firstUrl.includes('youtube') || firstUrl.includes('youtu.be')) {
          typeId = 2;
        } else if (firstUrl.includes('.pdf')) {
          typeId = 3;
        } else if (firstUrl.includes('archive.org') && firstUrl.includes('audio')) {
          typeId = 4;
        }
      }

      const { error } = await supabase
        .from('questions')
        .insert({
          chapter_id: parseInt(data.chapter_id),
          data: questionData,
          type_id: typeId,
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
          name="subject_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a subject" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id.toString()}>
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="chapter_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Chapter</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                value={field.value}
                disabled={!selectedSubjectId}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={selectedSubjectId ? "Select a chapter" : "Select a subject first"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {filteredChapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id.toString()}>
                      {chapter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

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
              {mediaUrls.map((url, index) => (
                <div key={index} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                  <span className="truncate flex-1">Attachment {index + 1}</span>
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