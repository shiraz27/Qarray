import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { MediaUploader } from './MediaUploader';

const resourceSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title must be less than 100 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(500, 'Description must be less than 500 characters'),
  subject_id: z.string().min(1, 'Please select a subject'),
  chapter_id: z.string().min(1, 'Please select a chapter'),
  type_id: z.string().optional(),
  devoir_type_id: z.string().optional(),
  with_correction: z.boolean().default(false),
});

type ResourceFormData = z.infer<typeof resourceSchema>;

interface Subject {
  id: number;
  name: string;
  class_id: number;
}

interface Chapter {
  id: number;
  name: string;
  subject_id: number;
}

interface AddResourceGlobalFormProps {
  resourceTypes: Array<{ id: number; type: string }>;
  devoirTypes: Array<{ id: number; devoir_type: string }>;
  onSuccess: () => void;
  onCancel: () => void;
}

export const AddResourceGlobalForm: React.FC<AddResourceGlobalFormProps> = ({ 
  resourceTypes,
  devoirTypes,
  onSuccess, 
  onCancel 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  
  const form = useForm<ResourceFormData>({
    resolver: zodResolver(resourceSchema),
    defaultValues: {
      title: '',
      description: '',
      subject_id: '',
      chapter_id: '',
      type_id: '',
      devoir_type_id: '',
      with_correction: false,
    },
  });

  useEffect(() => {
    fetchSubjects();
  }, []);

  useEffect(() => {
    if (selectedSubject) {
      fetchChapters(parseInt(selectedSubject));
    } else {
      setChapters([]);
      form.setValue('chapter_id', '');
    }
  }, [selectedSubject]);

  const fetchSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name, class_id')
        .eq('deleted', false)
        .order('name');

      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
      toast.error('Failed to load subjects');
    }
  };

  const fetchChapters = async (subjectId: number) => {
    try {
      const { data, error } = await supabase
        .from('chapters')
        .select('id, name, subject_id')
        .eq('subject_id', subjectId)
        .eq('deleted', false)
        .order('name');

      if (error) throw error;
      setChapters(data || []);
    } catch (error) {
      console.error('Error fetching chapters:', error);
      toast.error('Failed to load chapters');
    }
  };

  const handleMediaUploaded = (url: string) => {
    setMediaUrls(prev => [...prev, url]);
    toast.success('Media added successfully');
  };

  const removeMedia = (index: number) => {
    setMediaUrls(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: ResourceFormData) => {
    if (mediaUrls.length === 0) {
      toast.error('Please add at least one resource file or URL');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please login to add a resource');
        return;
      }

      // Auto-detect resource type based on media
      let typeId = parseInt(data.type_id) || 1;
      if (!data.type_id && mediaUrls.length > 0) {
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
        .from('resources')
        .insert({
          chapter_id: parseInt(data.chapter_id),
          subject_id: parseInt(data.subject_id),
          title: data.title,
          description: data.description,
          type_id: typeId,
          devoir_type_id: data.devoir_type_id ? parseInt(data.devoir_type_id) : null,
          with_correction: data.with_correction,
          data: mediaUrls,
          published_by: user.id,
          contributors: [user.id],
        });

      if (error) throw error;

      toast.success('Resource added successfully');
      form.reset();
      setMediaUrls([]);
      setSelectedSubject('');
      onSuccess();
    } catch (error) {
      console.error('Error adding resource:', error);
      toast.error('Failed to add resource');
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
              <Select 
                onValueChange={(value) => {
                  field.onChange(value);
                  setSelectedSubject(value);
                }} 
                defaultValue={field.value}
              >
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
                defaultValue={field.value}
                disabled={!selectedSubject}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a chapter" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {chapters.map((chapter) => (
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
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Enter resource title" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Describe the resource..."
                  className="min-h-24 resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <FormLabel>Resource Files/URLs</FormLabel>
          <MediaUploader 
            onMediaUploaded={handleMediaUploaded}
            uploadedMedia={mediaUrls.map(url => ({ url, type: 'mixed', name: url }))}
            onRemoveMedia={removeMedia}
          />
        </div>

        <FormField
          control={form.control}
          name="type_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Resource Type (Optional - Auto-detected)</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select resource type (optional)" />
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

        <FormField
          control={form.control}
          name="devoir_type_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Devoir Type (Optional)</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select devoir type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {devoirTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id.toString()}>
                      {type.devoir_type}
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
          name="with_correction"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  This resource includes corrections
                </FormLabel>
              </div>
            </FormItem>
          )}
        />

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add Resource
          </Button>
        </div>
      </form>
    </Form>
  );
};