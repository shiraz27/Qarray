import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Camera, Upload, Mic, Youtube, FileText, Loader2, X, Image, FileAudio, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { enhanceDocument, isMobileDevice } from '@/utils/documentScanner';
import { MediaPreviewDialog } from './MediaPreviewDialog';
import { Card } from '@/components/ui/card';

interface MediaUploaderProps {
  onMediaUploaded: (url: string, type: 'image' | 'video' | 'audio' | 'pdf') => void;
  acceptedTypes?: ('image' | 'video' | 'audio' | 'pdf')[];
  uploadedMedia?: Array<{ url: string; type: string; name: string }>;
  onRemoveMedia?: (index: number) => void;
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({ 
  onMediaUploaded,
  acceptedTypes = ['image', 'video', 'audio', 'pdf'],
  uploadedMedia = [],
  onRemoveMedia
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'audio' | 'pdf' | null>(null);
  const [isProcessingPreview, setIsProcessingPreview] = useState(false);
  const [enhanceImages, setEnhanceImages] = useState(false);
  const [fromCamera, setFromCamera] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const uploadToArchive = async (file: File, fileType: 'image' | 'audio' | 'pdf') => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileName', file.name);
      formData.append('fileType', fileType);

      const { data, error } = await supabase.functions.invoke('upload-to-archive', {
        body: formData,
      });

      if (error) throw error;

      toast.success('File uploaded successfully');
      onMediaUploaded(data.url, fileType);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Process multiple files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = (event) => {
        setPreviewUrl(event.target?.result as string);
        setPreviewFile(file);
        setPreviewType('image');
        setFromCamera(false);
      };
      reader.readAsDataURL(file);
      
      // Only show preview for first file, upload others directly
      if (i > 0) {
        await uploadToArchive(file, 'image');
      }
    }
    
    // Reset input
    e.target.value = '';
  };

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreviewUrl(event.target?.result as string);
      setPreviewFile(file);
      setPreviewType('image');
      setFromCamera(true);
    };
    reader.readAsDataURL(file);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Process multiple files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = (event) => {
        setPreviewUrl(event.target?.result as string);
        setPreviewFile(file);
        setPreviewType('pdf');
      };
      reader.readAsDataURL(file);
      
      // Only show preview for first file, upload others directly
      if (i > 0) {
        await uploadToArchive(file, 'pdf');
      }
    }
    
    // Reset input
    e.target.value = '';
  };

  const handleKeepFile = async () => {
    if (!previewFile || !previewType) return;
    
    setIsProcessingPreview(true);
    try {
      let fileToUpload = previewFile;
      
      // Apply enhancement if checkbox is checked, it's an image, and from camera
      if (previewType === 'image' && enhanceImages && fromCamera) {
        toast.info('Enhancing document...');
        const enhancedBlob = await enhanceDocument(previewFile);
        fileToUpload = new File([enhancedBlob], previewFile.name, { type: 'image/jpeg' });
      }
      
      await uploadToArchive(fileToUpload, previewType === 'pdf' ? 'pdf' : previewType);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
    } finally {
      setIsProcessingPreview(false);
      setPreviewUrl('');
      setPreviewFile(null);
      setPreviewType(null);
      setFromCamera(false);
      setAudioBlob(null); // Clear audio blob after upload
    }
  };

  const handleDiscardFile = () => {
    setPreviewUrl('');
    setPreviewFile(null);
    setPreviewType(null);
    setFromCamera(false);
    setIsProcessingPreview(false);
  };


  const handleYoutubeSubmit = () => {
    if (!youtubeUrl) {
      toast.error('Please enter a YouTube URL');
      return;
    }
    
    // Validate YouTube URL - support multiple formats
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/;
    const match = youtubeUrl.match(youtubeRegex);
    
    if (!match) {
      toast.error('Invalid YouTube URL');
      return;
    }

    onMediaUploaded(youtubeUrl, 'video');
    setYoutubeUrl('');
    toast.success('YouTube video added');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.success('Recording started');
    } catch (error) {
      console.error('Recording error:', error);
      toast.error('Failed to start recording');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.success('Recording stopped');
    }
  };

  const handlePreviewRecording = () => {
    if (!audioBlob) return;
    
    // Create preview URL for audio
    const audioUrl = URL.createObjectURL(audioBlob);
    const file = new File([audioBlob], `recording-${Date.now()}.webm`, { type: 'audio/webm' });
    
    setPreviewUrl(audioUrl);
    setPreviewFile(file);
    setPreviewType('audio');
  };

  const getMediaIcon = (url: string) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return <Video className="h-4 w-4 text-red-500" />;
    }
    if (url.includes('.pdf')) {
      return <FileText className="h-4 w-4 text-blue-500" />;
    }
    if (url.includes('audio') || url.includes('.mp3') || url.includes('.wav') || url.includes('.webm')) {
      return <FileAudio className="h-4 w-4 text-purple-500" />;
    }
    return <Image className="h-4 w-4 text-green-500" />;
  };

  const getMediaName = (url: string) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return 'YouTube Video';
    }
    if (url.includes('.pdf')) {
      return 'PDF Document';
    }
    if (url.includes('recording-')) {
      return 'Audio Recording';
    }
    if (url.includes('archive.org')) {
      const urlParts = url.split('/');
      return decodeURIComponent(urlParts[urlParts.length - 1]);
    }
    return 'Attachment';
  };

  return (
    <div className="space-y-4">
      {/* Uploaded Media List */}
      {uploadedMedia.length > 0 && (
        <Card className="p-3">
          <div className="space-y-2">
            <p className="text-sm font-semibold mb-2">Uploaded Files ({uploadedMedia.length})</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {uploadedMedia.map((media, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded-md hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getMediaIcon(media.url)}
                    <span className="text-sm truncate">{getMediaName(media.url)}</span>
                  </div>
                  {onRemoveMedia && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveMedia(index)}
                      className="h-7 w-7 p-0 flex-shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="image" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          {acceptedTypes.includes('image') && <TabsTrigger value="image">Image</TabsTrigger>}
          {acceptedTypes.includes('video') && <TabsTrigger value="video">YouTube</TabsTrigger>}
          {acceptedTypes.includes('audio') && <TabsTrigger value="audio">Audio</TabsTrigger>}
          {acceptedTypes.includes('pdf') && <TabsTrigger value="pdf">PDF</TabsTrigger>}
        </TabsList>

        {acceptedTypes.includes('image') && (
          <TabsContent value="image" className="space-y-3">
            <div>
              <Label htmlFor="image-upload">Upload Image</Label>
              <div className="flex items-center gap-2 mt-2 mb-3">
                <Checkbox 
                  id="enhance-images"
                  checked={enhanceImages}
                  onCheckedChange={(checked) => setEnhanceImages(checked as boolean)}
                />
                <label
                  htmlFor="enhance-images"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Enhance document images (applies to camera photos)
                </label>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex-1"
                >
                  {isUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Choose File
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex-1"
                >
                  <Camera className="mr-2 h-4 w-4" />
                  {isMobileDevice() ? 'Take Photo' : 'Camera'}
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture={isMobileDevice() ? 'environment' : undefined}
                onChange={handleCameraCapture}
                className="hidden"
              />
            </div>
          </TabsContent>
        )}

        <MediaPreviewDialog
          open={!!previewUrl}
          mediaUrl={previewUrl}
          mediaType={previewType}
          isProcessing={isProcessingPreview}
          onKeep={handleKeepFile}
          onDiscard={handleDiscardFile}
        />

        {acceptedTypes.includes('video') && (
          <TabsContent value="video" className="space-y-3">
            <div>
              <Label htmlFor="youtube-url">YouTube URL</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="youtube-url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                />
                <Button type="button" onClick={handleYoutubeSubmit}>
                  <Youtube className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
          </TabsContent>
        )}

        {acceptedTypes.includes('audio') && (
          <TabsContent value="audio" className="space-y-3">
            <div>
              <Label>Record Audio</Label>
              <div className="flex gap-2 mt-2">
                {!isRecording && !audioBlob && (
                  <Button type="button" onClick={startRecording} variant="outline" className="flex-1">
                    <Mic className="mr-2 h-4 w-4" />
                    Start Recording
                  </Button>
                )}
                {isRecording && (
                  <Button type="button" onClick={stopRecording} variant="destructive" className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                      Stop Recording
                    </div>
                  </Button>
                )}
                {audioBlob && !isRecording && (
                  <>
                    <Button 
                      type="button" 
                      onClick={handlePreviewRecording} 
                      className="flex-1"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Preview Recording
                    </Button>
                    <Button 
                      type="button" 
                      onClick={() => setAudioBlob(null)} 
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>
          </TabsContent>
        )}

        {acceptedTypes.includes('pdf') && (
          <TabsContent value="pdf" className="space-y-3">
            <div>
              <Label htmlFor="pdf-upload">Upload PDF</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => pdfInputRef.current?.click()}
                disabled={isUploading}
                className="w-full mt-2"
              >
                {isUploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                Choose PDF File
              </Button>
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                multiple
                onChange={handlePdfUpload}
                className="hidden"
              />
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
