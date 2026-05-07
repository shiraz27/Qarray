import React, { useState, useEffect, useRef } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, Bot, Edit3, Clock, Zap, AlertTriangle, Sparkles, ArrowLeft, Check, ArrowRight, X } from 'lucide-react';
import { MediaUploader } from './MediaUploader';
import { useUserRole } from '@/hooks/useUserRole';
import { processOcrAndExtractMetadata, OcrAndExtractResult } from '@/utils/ocrAndExtract';
import { mergeDescriptionWithAi } from '@/utils/metadataExtractor';
import { SchoolAutocomplete } from './SchoolAutocomplete';
import { AIBadge } from './AIBadge';
import { useFormPersistence } from '@/hooks/useFormPersistence';
import { useUploadManager } from '@/contexts/UploadManagerContext';

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

type Step = 'upload' | 'choose' | 'processing' | 'review' | 'manual';

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
  restoreSession?: boolean;
}

export const AddResourceGlobalForm: React.FC<AddResourceGlobalFormProps> = ({ 
  resourceTypes,
  devoirTypes,
  onSuccess, 
  onCancel,
  restoreSession = false
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [userClassId, setUserClassId] = useState<number | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const processingAbortRef = useRef<AbortController | null>(null);
  const [extractedData, setExtractedData] = useState<OcrAndExtractResult | null>(null);
  const [selectedInstituteId, setSelectedInstituteId] = useState<string | undefined>();
  const { isModerator, isAdmin } = useUserRole();

  // Map of remote URL -> original File blob for files uploaded in this session.
  // Used to OCR locally instead of re-fetching from Archive.org.
  const localFilesRef = useRef<Map<string, File>>(new Map());
  const hasRestoredRef = useRef(false);
  const { items: uploadManagerItems } = useUploadManager();
  
  // Form persistence
  const {
    isRestored,
    restoredData,
    saveFormData,
    clearFormSession,
    removeUploadedUrl,
  } = useFormPersistence('addResourceGlobal', '/dashboard');

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

  // Restore session data when dialog opens with restoreSession flag
  useEffect(() => {
    // Reset the ref when restoreSession changes to allow re-restoration
    if (!restoreSession) {
      hasRestoredRef.current = false;
      return;
    }
    
    if (restoreSession && isRestored && restoredData && !hasRestoredRef.current) {
      hasRestoredRef.current = true;
      console.log('[AddResourceGlobalForm] Restoring session:', restoredData);
      
      // Get URLs from localStorage session
      const sessionUrls = restoredData.uploadedUrls || [];
      
      // Get completed upload URLs from UploadManager that match our route
      const managerUrls = uploadManagerItems
        .filter(item => item.sourceRoute === '/dashboard' && item.status === 'completed' && item.url)
        .map(item => item.url as string);
      
      // Merge and deduplicate
      const allUrls = [...new Set([...sessionUrls, ...managerUrls])];
      
      if (allUrls.length > 0) {
        setMediaUrls(allUrls);
        toast.success(`Restored ${allUrls.length} uploaded file(s)`);
      }
      
      // Restore form values
      if (restoredData.data) {
        const { step: savedStep, formValues, selectedSubject: savedSubject } = restoredData.data;
        
        if (savedStep) {
          setStep(savedStep as Step);
        }
        
        if (savedSubject) {
          setSelectedSubject(savedSubject);
        }
        
        if (formValues) {
          Object.entries(formValues).forEach(([key, value]) => {
            if (value !== undefined && value !== '') {
              form.setValue(key as keyof ResourceFormData, value as any);
            }
          });
        }
      }
    }
  }, [restoreSession, isRestored, restoredData, form, uploadManagerItems]);

  // Save form state whenever it changes
  useEffect(() => {
    if (mediaUrls.length > 0 || step !== 'upload') {
      saveFormData(
        { 
          step, 
          formValues: form.getValues(),
          selectedSubject 
        },
        mediaUrls
      );
    }
  }, [mediaUrls, step, selectedSubject, saveFormData]);

  useEffect(() => {
    fetchUserClass();
  }, []);

  useEffect(() => {
    if (userClassId) {
      fetchSubjects();
    }
  }, [userClassId]);

  const fetchUserClass = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('class_id')
      .eq('user_id', user.id)
      .single();

    if (profile) {
      setUserClassId(profile.class_id);
    }
  };

  const fetchSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name, class_id')
        .eq('class_id', userClassId)
        .eq('deleted', false)
        .order('name');

      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
      toast.error('Failed to load subjects');
    }
  };

  useEffect(() => {
    if (selectedSubject) {
      fetchChapters(parseInt(selectedSubject));
    } else {
      setChapters([]);
      form.setValue('chapter_id', '');
    }
  }, [selectedSubject]);

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

  const handleMediaUploaded = (url: string, type: 'image' | 'video' | 'audio' | 'pdf', file?: File) => {
    setMediaUrls(prev => [...prev, url]);
    if (file) {
      localFilesRef.current.set(url, file);
    }
    // URL persistence is handled by the saveFormData useEffect
    toast.success('Media added successfully');
  };

  const removeMedia = (index: number) => {
    const urlToRemove = mediaUrls[index];
    setMediaUrls(prev => prev.filter((_, i) => i !== index));
    if (urlToRemove) {
      localFilesRef.current.delete(urlToRemove);
    }
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
    // Validate subject and chapter are selected
    const subjectId = form.getValues('subject_id');
    const chapterId = form.getValues('chapter_id');
    
    if (!subjectId || !chapterId) {
      toast.error('Please select a subject and chapter first');
      return;
    }

    setStep('processing');
    setProcessingProgress(2);
    setProcessingMessage('Starting OCR processing...');
    setProcessingElapsed(0);

    const abort = new AbortController();
    processingAbortRef.current = abort;
    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      setProcessingElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    const watchdog = window.setTimeout(() => {
      abort.abort();
      toast.error('Processing is taking too long. Switching to manual entry.');
      setStep('manual');
    }, 180000);

    try {
      const result = await processOcrAndExtractMetadata(
        mediaUrls,
        ({ message, progress }) => {
          setProcessingMessage(message);
          setProcessingProgress(prev => Math.max(prev, Math.min(progress, 99)));
        },
        localFilesRef.current,
        abort.signal
      );

      if (abort.signal.aborted) return;

      // Check if processing was successful
      if (!result.success) {
        toast.error(result.message || 'Could not process files. Please try again or use manual entry.');
        setProcessingProgress(0);
        setProcessingMessage('');
        setStep('choose');
        return;
      }

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
        form.setValue('type_ids', [result.metadata.suggested_type_id]);
      }
      if (result.metadata.suggested_devoir_type_id) {
        form.setValue('devoir_type_id', result.metadata.suggested_devoir_type_id.toString());
      }

      // Merge AI block (summary + key metadata) into existing description,
      // replacing any prior auto-block so retries don't duplicate content.
      const merged = mergeDescriptionWithAi(form.getValues('description'), result.metadata);
      if (merged) form.setValue('description', merged);

      setTimeout(() => {
        setStep('review');
      }, 500);
    } catch (error: any) {
      if (abort.signal.aborted) return;
      console.error('Processing error:', error);
      toast.error('Failed to process files: ' + (error?.message || 'Unknown error'));
      setStep('choose');
    } finally {
      window.clearInterval(tick);
      window.clearTimeout(watchdog);
      processingAbortRef.current = null;
    }
  };

  const handleCancelProcessing = (target: 'choose' | 'manual') => {
    processingAbortRef.current?.abort();
    setProcessingProgress(0);
    setProcessingMessage('');
    setStep(target);
  };

  const handleChooseManual = () => {
    // Validate subject and chapter are selected
    const subjectId = form.getValues('subject_id');
    const chapterId = form.getValues('chapter_id');
    
    if (!subjectId || !chapterId) {
      toast.error('Please select a subject and chapter first');
      return;
    }
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
      let typeIds: number[] = data.type_ids ?? [];
      if (typeIds.length === 0 && mediaUrls.length > 0) {
        let detected = 1;
        const firstUrl = mediaUrls[0].toLowerCase();
        if (firstUrl.includes('youtube') || firstUrl.includes('youtu.be')) {
          detected = 6; // Vidéo
        } else if (firstUrl.includes('.pdf')) {
          detected = 5; // PDF
        } else if (firstUrl.includes('archive.org') && firstUrl.includes('audio')) {
          detected = 4;
        }
        typeIds = [detected];
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
          verified: isModerator || isAdmin,
          ocr_status: ocrStatus,
          ocr_text: extractedData?.ocrText || null,
          school_name: data.school_name || null,
          teacher_name: data.teacher_name || null,
          institute_id: selectedInstituteId || null,
          book: data.book || null,
        });

      if (error) throw error;

      toast.success(step === 'review' ? 'Resource added with AI-extracted metadata!' : 'Resource added successfully');
      clearFormSession(); // Clear persisted session on success
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

  // Step 2: Choose Mode (with Subject/Chapter selection)
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

        {/* Subject and Chapter Selection */}
        <div className="space-y-4 border rounded-lg p-4">
          <h4 className="font-medium">Select Subject & Chapter</h4>
          
          <Form {...form}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      value={field.value}
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
                      value={field.value}
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
            </div>
          </Form>
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
            This may take 15-30 seconds · {processingElapsed}s elapsed
          </p>
        </div>

        <div className="space-y-2">
          <Progress value={processingProgress} className="h-2" />
          <p className="text-sm text-center text-muted-foreground">
            {processingMessage}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => handleCancelProcessing('choose')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleCancelProcessing('manual')}>
            <Edit3 className="h-4 w-4 mr-1" />
            Cancel and fill manually
          </Button>
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
          Files: {mediaUrls.length} attached | Subject & Chapter selected
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isReviewMode ? 'Submit Resource' : 'Add Resource'}
          </Button>
        </div>
      </form>
    </Form>
  );
};
