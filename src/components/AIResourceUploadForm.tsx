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
import { Badge } from '@/components/ui/badge';
import { Loader2, Bot, Sparkles, ArrowLeft, Check, X } from 'lucide-react';
import { MediaUploader } from './MediaUploader';
import { useUserRole } from '@/hooks/useUserRole';
import { processOcrAndExtractMetadata, OcrAndExtractResult } from '@/utils/ocrAndExtract';
import { Progress } from '@/components/ui/progress';

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

type Step = 'upload' | 'processing' | 'review';

interface AIResourceUploadFormProps {
  chapterId: number;
  subjectId: number;
  resourceTypes: Array<{ id: number; type: string }>;
  devoirTypes: Array<{ id: number; devoir_type: string }>;
  onSuccess: () => void;
  onCancel: () => void;
  onSwitchToManual: () => void;
}

export const AIResourceUploadForm: React.FC<AIResourceUploadFormProps> = ({ 
  chapterId,
  subjectId,
  resourceTypes,
  devoirTypes,
  onSuccess, 
  onCancel,
  onSwitchToManual
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');
  const [extractedData, setExtractedData] = useState<OcrAndExtractResult | null>(null);
  const { isModerator, isAdmin } = useUserRole();
  
  const form = useForm<ResourceFormData>({
    resolver: zodResolver(resourceSchema),
    defaultValues: {
      title: '',
      description: '',
      type_id: '',
      devoir_type_id: '',
      with_correction: false,
      school_name: '',
      teacher_name: '',
    },
  });

  const handleMediaUploaded = (url: string, type: 'image' | 'video' | 'audio' | 'pdf') => {
    setMediaUrls(prev => [...prev, url]);
    toast.success('Media added successfully');
  };

  const removeMedia = (index: number) => {
    setMediaUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleStartProcessing = async () => {
    if (mediaUrls.length === 0) {
      toast.error('Please add at least one file first');
      return;
    }

    setStep('processing');
    setProcessingProgress(10);
    setProcessingMessage('Starting OCR processing...');

    try {
      const result = await processOcrAndExtractMetadata(
        mediaUrls,
        (message) => {
          setProcessingMessage(message);
          setProcessingProgress(prev => Math.min(prev + 15, 90));
        }
      );

      setExtractedData(result);
      setProcessingProgress(100);

      // Pre-fill form with extracted data
      if (result.metadata.suggested_title) {
        form.setValue('title', result.metadata.suggested_title);
      }
      if (result.metadata.school_name) {
        form.setValue('school_name', result.metadata.school_name);
      }
      if (result.metadata.teacher_name) {
        form.setValue('teacher_name', result.metadata.teacher_name);
      }
      if (result.metadata.suggested_type_id) {
        form.setValue('type_id', result.metadata.suggested_type_id.toString());
      }
      if (result.metadata.suggested_devoir_type_id) {
        form.setValue('devoir_type_id', result.metadata.suggested_devoir_type_id.toString());
      }

      // Generate a default description if none exists
      if (!form.getValues('description')) {
        const parts: string[] = [];
        if (result.metadata.suggested_title) parts.push(result.metadata.suggested_title);
        if (result.metadata.school_name) parts.push(`🏫 ${result.metadata.school_name}`);
        if (result.metadata.teacher_name) parts.push(`👨‍🏫 ${result.metadata.teacher_name}`);
        form.setValue('description', parts.join(' - ') || 'Resource description');
      }

      setTimeout(() => {
        setStep('review');
      }, 500);

    } catch (error: any) {
      console.error('Processing error:', error);
      toast.error('Failed to process files: ' + error.message);
      setStep('upload');
    }
  };

  const onSubmit = async (data: ResourceFormData) => {
    if (mediaUrls.length === 0) {
      toast.error('Please add at least one resource file');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please login to add a resource');
        return;
      }

      // Use form type_id or default to 1
      let typeId = parseInt(data.type_id || '1') || 1;

      // Check if any media is PDF or image
      const isPdfOrImage = mediaUrls.some(url => {
        const lowerUrl = url.toLowerCase();
        return lowerUrl.includes('.pdf') || 
               lowerUrl.match(/\.(jpg|jpeg|png|gif|webp)/);
      });

      const { error } = await supabase
        .from('resources')
        .insert({
          chapter_id: chapterId,
          subject_id: subjectId,
          title: data.title,
          description: data.description,
          type_id: typeId,
          devoir_type_id: data.devoir_type_id ? parseInt(data.devoir_type_id) : null,
          with_correction: data.with_correction,
          data: mediaUrls,
          published_by: user.id,
          contributors: [user.id],
          verified: isModerator || isAdmin,
          ocr_status: 'completed', // Already processed
          ocr_text: extractedData?.ocrText || null,
          school_name: data.school_name || null,
          teacher_name: data.teacher_name || null,
        });

      if (error) throw error;

      toast.success('Resource added successfully with AI-extracted metadata!');
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

  // Step 1: Upload
  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <span className="font-medium">AI Auto-Fill Mode</span>
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-sm">
          <p className="text-muted-foreground">
            Upload your file(s) and AI will automatically extract the title, school name, 
            teacher name, and resource type. You can review and edit before submitting.
          </p>
        </div>

        <div>
          <FormLabel>Resource Files</FormLabel>
          <MediaUploader 
            onMediaUploaded={handleMediaUploaded}
            uploadedMedia={mediaUrls.map(url => ({ url, type: 'mixed', name: url }))}
            onRemoveMedia={removeMedia}
            chapterId={chapterId}
            contentType="resource"
            onUploadStateChange={setIsUploading}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onSwitchToManual}>
            Switch to Manual
          </Button>
          <Button 
            onClick={handleStartProcessing} 
            disabled={mediaUrls.length === 0 || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Process with AI
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Step 2: Processing
  if (step === 'processing') {
    return (
      <div className="space-y-6 py-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center p-4 rounded-full bg-primary/10 mb-4">
            <Bot className="h-8 w-8 text-primary animate-pulse" />
          </div>
          <h3 className="text-lg font-semibold">AI is processing your files</h3>
          <p className="text-sm text-muted-foreground mt-1">
            This may take 15-30 seconds
          </p>
        </div>

        <div className="space-y-2">
          <Progress value={processingProgress} className="h-2" />
          <p className="text-sm text-center text-muted-foreground">
            {processingMessage}
          </p>
        </div>
      </div>
    );
  }

  // Step 3: Review
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" onClick={() => setStep('upload')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-500" />
            <span className="font-medium">Review AI-Extracted Data</span>
          </div>
        </div>

        <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-sm flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-green-600 mt-0.5" />
          <p className="text-green-700 dark:text-green-300">
            AI has extracted the data below. Review and edit if needed before submitting.
          </p>
        </div>

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                Title
                {extractedData?.metadata.suggested_title && (
                  <Badge variant="secondary" className="text-xs">
                    <Bot className="h-3 w-3 mr-1" />
                    AI
                  </Badge>
                )}
              </FormLabel>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="type_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  Resource Type
                  {extractedData?.metadata.suggested_type_id && (
                    <Badge variant="secondary" className="text-xs">
                      <Bot className="h-3 w-3 mr-1" />
                      AI
                    </Badge>
                  )}
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select resource type" />
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
                <FormLabel className="flex items-center gap-2">
                  Devoir Type
                  {extractedData?.metadata.suggested_devoir_type_id && (
                    <Badge variant="secondary" className="text-xs">
                      <Bot className="h-3 w-3 mr-1" />
                      AI
                    </Badge>
                  )}
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select devoir type (optional)" />
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="school_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  School Name
                  {extractedData?.metadata.school_name && (
                    <Badge variant="secondary" className="text-xs">
                      <Bot className="h-3 w-3 mr-1" />
                      AI
                    </Badge>
                  )}
                </FormLabel>
                <FormControl>
                  <Input placeholder="🏫 School name" {...field} />
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
                <FormLabel className="flex items-center gap-2">
                  Teacher Name
                  {extractedData?.metadata.teacher_name && (
                    <Badge variant="secondary" className="text-xs">
                      <Bot className="h-3 w-3 mr-1" />
                      AI
                    </Badge>
                  )}
                </FormLabel>
                <FormControl>
                  <Input placeholder="👨‍🏫 Teacher name" {...field} />
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

        <div className="text-xs text-muted-foreground">
          Files attached: {mediaUrls.length}
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Resource
          </Button>
        </div>
      </form>
    </Form>
  );
};
