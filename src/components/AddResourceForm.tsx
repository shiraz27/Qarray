import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useSearchParams } from 'react-router-dom';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, Bot, Edit3, Clock, Zap, AlertTriangle, Sparkles, ArrowLeft, Check, ArrowRight } from 'lucide-react';
import { MediaUploader } from './MediaUploader';
import { useUserRole } from '@/hooks/useUserRole';
import { processOcrAndExtractMetadata, OcrAndExtractResult } from '@/utils/ocrAndExtract';
import { SchoolAutocomplete } from './SchoolAutocomplete';
import { AIBadge } from './AIBadge';
import { useFormPersistence } from '@/hooks/useFormPersistence';

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

type Step = 'upload' | 'choose' | 'processing' | 'review' | 'manual';

interface AddResourceFormProps {
  chapterId: number;
  subjectId: number;
  resourceTypes: Array<{ id: number; type: string }>;
  devoirTypes: Array<{ id: number; devoir_type: string }>;
  onSuccess: () => void;
  onCancel: () => void;
}

export const AddResourceForm: React.FC<AddResourceFormProps> = ({ 
  chapterId,
  subjectId,
  resourceTypes,
  devoirTypes,
  onSuccess, 
  onCancel 
}) => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [step, setStep] = useState<Step>('upload');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');
  const [extractedData, setExtractedData] = useState<OcrAndExtractResult | null>(null);
  const [selectedInstituteId, setSelectedInstituteId] = useState<string | undefined>();
  const { isModerator, isAdmin } = useUserRole();
  
  // Form persistence
  const { 
    isRestored, 
    restoredData, 
    saveFormData, 
    clearFormSession, 
    removeUploadedUrl 
  } = useFormPersistence('addResource', location.pathname);
  
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

  // Restore form state from session on mount
  useEffect(() => {
    if (isRestored && restoredData) {
      // Restore uploaded URLs
      if (restoredData.uploadedUrls.length > 0) {
        setMediaUrls(restoredData.uploadedUrls);
        // If we have URLs, go to choose step
        if (restoredData.data?.step) {
          setStep(restoredData.data.step as Step);
        } else if (restoredData.uploadedUrls.length > 0) {
          setStep('choose');
        }
        toast.success(`Restored ${restoredData.uploadedUrls.length} uploaded file(s)`);
      }
      // Restore form data
      if (restoredData.data?.formValues) {
        Object.entries(restoredData.data.formValues).forEach(([key, value]) => {
          form.setValue(key as keyof ResourceFormData, value as any);
        });
      }
      // Clear the restore flag from URL
      if (searchParams.has('restoreForm')) {
        searchParams.delete('restoreForm');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [isRestored, restoredData, form, searchParams, setSearchParams]);

  // Save form state whenever it changes
  useEffect(() => {
    if (mediaUrls.length > 0 || Object.values(form.getValues()).some(v => v)) {
      saveFormData(
        { step, formValues: form.getValues() },
        mediaUrls
      );
    }
  }, [mediaUrls, step, saveFormData]);

  const handleMediaUploaded = (url: string, type: 'image' | 'video' | 'audio' | 'pdf') => {
    setMediaUrls(prev => [...prev, url]);
    // URL persistence is handled by the saveFormData useEffect
    toast.success('Media added successfully');
  };

  const removeMedia = (index: number) => {
    const urlToRemove = mediaUrls[index];
    setMediaUrls(prev => prev.filter((_, i) => i !== index));
    // Keep session in sync when files are removed
    if (urlToRemove) {
      removeUploadedUrl(urlToRemove);
    }
  };

  const handleContinueToChoose = () => {
    if (mediaUrls.length === 0) {
      toast.error('Please add at least one file first');
      return;
    }
    setStep('choose');
  };

  const handleChooseAI = async () => {
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

      // Use AI-generated description if available
      if (result.metadata.suggested_description) {
        form.setValue('description', result.metadata.suggested_description);
      } else if (!form.getValues('description')) {
        // Fallback to old behavior if no AI description
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
      setStep('choose');
    }
  };

  const handleChooseManual = () => {
    setStep('manual');
  };

  const handleSchoolChange = (value: string, instituteId?: string) => {
    form.setValue('school_name', value);
    setSelectedInstituteId(instituteId);
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
      let typeId = parseInt(data.type_id || '1') || 1;
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

      // Check if any media is PDF or image
      const isPdfOrImage = mediaUrls.some(url => {
        const lowerUrl = url.toLowerCase();
        return lowerUrl.includes('.pdf') || 
               lowerUrl.match(/\.(jpg|jpeg|png|gif|webp)/);
      });

      // Determine OCR status based on step
      const ocrStatus = step === 'review' ? 'completed' : (isPdfOrImage ? 'pending' : 'not_applicable');

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
          ocr_status: ocrStatus,
          ocr_text: extractedData?.ocrText || null,
          school_name: data.school_name || null,
          teacher_name: data.teacher_name || null,
          institute_id: selectedInstituteId || null,
        });

      if (error) throw error;

      toast.success(step === 'review' ? 'Resource added with AI-extracted metadata!' : 'Resource added successfully');
      clearFormSession(); // Clear persisted form data on success
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

  // Step 1: Upload Files
  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <div className="text-center mb-4">
          <h3 className="text-lg font-semibold">Upload Resource Files</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Add your files first, then choose how to fill the details
          </p>
        </div>

        <div>
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Resource Files/URLs
          </label>
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
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleContinueToChoose} 
            disabled={mediaUrls.length === 0 || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Step 2: Choose Mode
  if (step === 'choose') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" onClick={() => setStep('upload')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>

        <div className="bg-muted/50 rounded-lg p-3 text-sm flex items-center gap-2">
          <Check className="h-4 w-4 text-green-500" />
          <span>{mediaUrls.length} file(s) uploaded</span>
        </div>

        <div className="text-center mb-4">
          <h3 className="text-lg font-semibold">How do you want to fill the details?</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Choose AI extraction or manual entry
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* AI Auto-Fill Option */}
          <Card 
            className="cursor-pointer border-2 hover:border-primary/50 transition-colors"
            onClick={handleChooseAI}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-full bg-primary/10">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">AI Auto-Fill</CardTitle>
              </div>
              <Badge variant="secondary" className="w-fit">
                <Clock className="h-3 w-3 mr-1" />
                15-30 seconds
              </Badge>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="text-sm space-y-2">
                <p>AI will extract:</p>
                <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
                  <li>📝 Title & Description</li>
                  <li>🏫 School name (with autocomplete)</li>
                  <li>👨‍🏫 Teacher name</li>
                  <li>📂 Resource type</li>
                  <li>📋 Devoir type</li>
                </ul>
                <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs mt-2">
                  <AlertTriangle className="h-3 w-3" />
                  <span>You can edit before submitting</span>
                </div>
              </CardDescription>
            </CardContent>
          </Card>

          {/* Manual Fill Option */}
          <Card 
            className="cursor-pointer border-2 hover:border-primary/50 transition-colors"
            onClick={handleChooseManual}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-full bg-secondary">
                  <Edit3 className="h-5 w-5 text-secondary-foreground" />
                </div>
                <CardTitle className="text-base">Manual Fill</CardTitle>
              </div>
              <Badge variant="outline" className="w-fit">
                <Zap className="h-3 w-3 mr-1" />
                Instant
              </Badge>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="text-sm space-y-2">
                <p>Fill all fields yourself:</p>
                <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
                  <li>✏️ You control everything</li>
                  <li>⚡ Fast submission</li>
                  <li>🎯 Best for known content</li>
                </ul>
                <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs mt-2">
                  <Zap className="h-3 w-3" />
                  <span>Quick and immediate</span>
                </div>
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center gap-2 pt-2">
          <Button 
            variant="default" 
            onClick={handleChooseAI}
            className="gap-2"
          >
            <Bot className="h-4 w-4" />
            Use AI Auto-Fill
          </Button>
          <Button 
            variant="outline" 
            onClick={handleChooseManual}
            className="gap-2"
          >
            <Edit3 className="h-4 w-4" />
            Fill Manually
          </Button>
        </div>
      </div>
    );
  }

  // Step 3: Processing (AI only)
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

  // Step 4: Review (AI) or Step 5: Manual Form
  const isReviewMode = step === 'review';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" onClick={() => setStep('choose')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            {isReviewMode ? (
              <>
                <Check className="h-5 w-5 text-green-500" />
                <span className="font-medium">Review AI-Extracted Data</span>
              </>
            ) : (
              <>
                <Edit3 className="h-5 w-5 text-primary" />
                <span className="font-medium">Manual Entry</span>
              </>
            )}
          </div>
        </div>

        {isReviewMode && (
          <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-sm flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-green-600 mt-0.5" />
            <p className="text-green-700 dark:text-green-300">
              AI has extracted the data below. Review and edit if needed before submitting.
            </p>
          </div>
        )}

        <div className="bg-muted/50 rounded-lg p-2 text-xs text-muted-foreground">
          Files: {mediaUrls.length} attached
        </div>

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                Title
                {isReviewMode && extractedData?.metadata.suggested_title && (
                  <AIBadge />
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
              <FormLabel className="flex items-center gap-2">
                Description
                {isReviewMode && extractedData?.metadata.suggested_description && (
                  <AIBadge />
                )}
              </FormLabel>
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
                  {isReviewMode && extractedData?.metadata.suggested_type_id && (
                    <AIBadge />
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
                  {isReviewMode && extractedData?.metadata.suggested_devoir_type_id && (
                    <AIBadge />
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
                  {isReviewMode && extractedData?.metadata.school_name && (
                    <AIBadge />
                  )}
                </FormLabel>
                <FormControl>
                  <SchoolAutocomplete
                    value={field.value || ''}
                    onChange={handleSchoolChange}
                    aiSuggested={extractedData?.metadata.school_name}
                    placeholder="🏫 Search or add school..."
                  />
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
                  {isReviewMode && extractedData?.metadata.teacher_name && (
                    <AIBadge />
                  )}
                </FormLabel>
                <FormControl>
                  <Input placeholder="👨‍🏫 Teacher name (optional)" {...field} />
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isReviewMode ? 'Submit Resource' : 'Add Resource'}
          </Button>
        </div>
      </form>
    </Form>
  );
};
