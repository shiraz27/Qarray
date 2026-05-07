import React, { useState, useEffect, useMemo } from 'react';
import { BookAutocomplete } from "@/components/BookAutocomplete";
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
import { useUploadManager } from '@/contexts/UploadManagerContext';
import { ResourceTypeMultiSelect } from './ResourceTypeMultiSelect';

const resourceSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title must be less than 100 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(500, 'Description must be less than 500 characters'),
  subject_id: z.string().min(1, 'Please select a subject'),
  chapter_id: z.string().min(1, 'Please select a chapter'),
  type_ids: z.array(z.number()).default([]),
  devoir_type_id: z.string().optional(),
  with_correction: z.boolean().default(false),
  school_name: z.string().max(200).optional(),
  teacher_name: z.string().max(200).optional(),
  book: z.string().max(200).optional(),
});

type ResourceFormData = z.infer<typeof resourceSchema>;

interface Subject {
  id: number;
  name: string;
}

interface Chapter {
  id: number;
  name: string;
  subject_id: number;
}

interface AddResourceFormWithSelectionProps {
  resourceTypes: Array<{ id: number; type: string }>;
  devoirTypes: Array<{ id: number; devoir_type: string }>;
  onSuccess: () => void;
  onCancel: () => void;
}

export const AddResourceFormWithSelection: React.FC<AddResourceFormWithSelectionProps> = ({ 
  resourceTypes,
  devoirTypes,
  onSuccess, 
  onCancel 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [filteredChapters, setFilteredChapters] = useState<Chapter[]>([]);
  const { getUploadsByCallback } = useUploadManager();
  
  // Generate stable callback ID for tracking uploads
  const callbackId = useMemo(() => `add-resource-sel-${Date.now()}`, []);
  
  // Check for pending uploads
  const myUploads = getUploadsByCallback(callbackId);
  const hasPendingUploads = myUploads.some(u => u.status === 'queued' || u.status === 'uploading');
  const form = useForm<ResourceFormData>({
    resolver: zodResolver(resourceSchema),
    defaultValues: {
      title: '',
      description: '',
      subject_id: '',
      chapter_id: '',
      type_ids: [],
      devoir_type_id: '',
      with_correction: false,
      school_name: '',
      teacher_name: '',
      book: '',
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

  const handleMediaUploaded = (url: string, type: 'image' | 'video' | 'audio' | 'pdf') => {
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

      let typeIds: number[] = data.type_ids ?? [];
      if (typeIds.length === 0 && mediaUrls.length > 0) {
        const firstUrl = mediaUrls[0].toLowerCase();
        let detected = 1;
        if (firstUrl.includes('youtube') || firstUrl.includes('youtu.be')) {
          detected = 6;
        } else if (firstUrl.includes('.pdf')) {
          detected = 5;
        }
        typeIds = [detected];
      }

      // Check if any media is PDF or image
      const isPdfOrImage = mediaUrls.some(url => {
        const lowerUrl = url.toLowerCase();
        return lowerUrl.includes('.pdf') || 
               lowerUrl.match(/\.(jpg|jpeg|png|gif|webp)/);
      });

      const { data: insertedResource, error } = await (supabase as any).from('resources')
        .insert({
          chapter_id: parseInt(data.chapter_id),
          subject_id: parseInt(data.subject_id),
          title: data.title,
          description: data.description,
          type_ids: typeIds,
          devoir_type_id: data.devoir_type_id ? parseInt(data.devoir_type_id) : null,
          with_correction: data.with_correction,
          data: mediaUrls,
          published_by: user.id,
          contributors: [user.id],
          ocr_status: isPdfOrImage ? 'pending' : 'not_applicable',
          school_name: data.school_name || null,
          teacher_name: data.teacher_name || null,
          book: data.book || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Resource added successfully');
      
      form.reset();
      setMediaUrls([]);
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
            chapterId={parseInt(form.watch('chapter_id')) || undefined}
            contentType="resource"
          />
        </div>

        <FormField
          control={form.control}
          name="type_ids"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Resource Types (Optional - select one or more)</FormLabel>
              <FormControl>
                <ResourceTypeMultiSelect
                  options={resourceTypes}
                  value={(field.value as number[]) || []}
                  onChange={field.onChange}
                />
              </FormControl>
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
              <Select onValueChange={field.onChange} value={field.value}>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="school_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>School Name (Optional - AI auto-detected)</FormLabel>
                <FormControl>
                  <Input placeholder="🏫 e.g. ثانوية محمد البشير الإبراهيمي" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="teacher_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teacher Name (Optional - AI auto-detected)</FormLabel>
                <FormControl>
                  <Input placeholder="👨‍🏫 e.g. الأستاذ أحمد بن محمد" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="book"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Book (Optional)</FormLabel>
              <FormControl>
                <BookAutocomplete value={field.value || ""} onChange={field.onChange} source="resource" />
              </FormControl>
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
          <Button type="submit" disabled={isSubmitting || hasPendingUploads}>
            {(isSubmitting || hasPendingUploads) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hasPendingUploads ? 'Uploading...' : 'Add Resource'}
          </Button>
        </div>
      </form>
    </Form>
  );
};