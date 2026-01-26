import React, { useState, useMemo } from 'react';
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

const resourceSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title must be less than 100 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(500, 'Description must be less than 500 characters'),
  type_id: z.string().optional(),
  devoir_type_id: z.string().optional(),
  with_correction: z.boolean().default(false),
  school_name: z.string().max(200).optional(),
  teacher_name: z.string().max(200).optional(),
});

type ResourceFormData = z.infer<typeof resourceSchema>;

interface EditResourceFormProps {
  resourceId: number;
  chapterId: number;
  initialData: {
    title: string;
    description: string;
    data: string[];
    type_id: number | null;
    devoir_type_id: number | null;
    with_correction: boolean;
    school_name?: string | null;
    teacher_name?: string | null;
  };
  resourceTypes: Array<{ id: number; type: string }>;
  devoirTypes: Array<{ id: number; devoir_type: string }>;
  onSuccess: () => void;
  onCancel: () => void;
}

export const EditResourceForm: React.FC<EditResourceFormProps> = ({ 
  resourceId,
  chapterId,
  initialData,
  resourceTypes,
  devoirTypes,
  onSuccess, 
  onCancel 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>(initialData.data);
  const { getUploadsByCallback } = useUploadManager();
  
  // Generate stable callback ID for tracking uploads
  const callbackId = useMemo(() => `edit-resource-${Date.now()}`, []);
  
  // Check for pending uploads
  const myUploads = getUploadsByCallback(callbackId);
  const hasPendingUploads = myUploads.some(u => u.status === 'queued' || u.status === 'uploading');
  
  const form = useForm<ResourceFormData>({
    resolver: zodResolver(resourceSchema),
    defaultValues: {
      title: initialData.title,
      description: initialData.description,
      type_id: initialData.type_id?.toString() || '',
      devoir_type_id: initialData.devoir_type_id?.toString() || '',
      with_correction: initialData.with_correction,
      school_name: initialData.school_name || '',
      teacher_name: initialData.teacher_name || '',
    },
  });

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
        toast.error('Please login to edit resource');
        return;
      }

      // Auto-detect resource type based on media
      let typeId = parseInt(data.type_id) || 1;
      if (!data.type_id && mediaUrls.length > 0) {
        const firstUrl = mediaUrls[0].toLowerCase();
        if (firstUrl.includes('youtube') || firstUrl.includes('youtu.be')) {
          typeId = 2; // Video type
        } else if (firstUrl.includes('.pdf')) {
          typeId = 3; // Document type
        } else if (firstUrl.includes('archive.org') && firstUrl.includes('audio')) {
          typeId = 4; // Audio type
        }
      }

      // Check if any NEW media is PDF or image (only set pending if new files added)
      const newMediaUrls = mediaUrls.filter(url => !initialData.data.includes(url));
      const hasNewPdfOrImage = newMediaUrls.some(url => {
        const lowerUrl = url.toLowerCase();
        return lowerUrl.includes('.pdf') || 
               lowerUrl.match(/\.(jpg|jpeg|png|gif|webp)/);
      });

      const updateData: any = {
        title: data.title,
        description: data.description,
        type_id: typeId,
        devoir_type_id: data.devoir_type_id ? parseInt(data.devoir_type_id) : null,
        with_correction: data.with_correction,
        data: mediaUrls,
        school_name: data.school_name || null,
        teacher_name: data.teacher_name || null,
      };

      // Only update OCR status if new PDF/image was added
      if (hasNewPdfOrImage) {
        updateData.ocr_status = 'pending';
      }

      const { error } = await supabase
        .from('resources')
        .update(updateData)
        .eq('id', resourceId);

      if (error) throw error;

      toast.success('Resource updated successfully');
      
      onSuccess();
    } catch (error) {
      console.error('Error updating resource:', error);
      toast.error('Failed to update resource');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
            chapterId={chapterId}
            contentType="resource"
            contentId={resourceId.toString()}
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
            {hasPendingUploads ? 'Uploading...' : 'Update Resource'}
          </Button>
        </div>
      </form>
    </Form>
  );
};
