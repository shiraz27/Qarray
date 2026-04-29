import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000; // 2 seconds

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function uploadWithRetry(
  uploadUrl: string,
  headers: Record<string, string>,
  body: ArrayBuffer,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff
        const backoffDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        console.log(`Retry attempt ${attempt}, waiting ${backoffDelay}ms`);
        await delay(backoffDelay);
      }

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers,
        body: new Blob([body]),
      });

      // Check for rate limiting (503 SlowDown)
      if (response.status === 503) {
        const errorText = await response.text();
        console.warn(`Archive.org returned 503 (attempt ${attempt + 1}):`, errorText);
        
        if (attempt < retries) {
          continue; // Retry
        }
        
        throw new Error(`Rate limited after ${retries + 1} attempts: ${errorText}`);
      }

      // Check for other retryable errors
      if (response.status >= 500 && attempt < retries) {
        console.warn(`Server error ${response.status} (attempt ${attempt + 1}), retrying...`);
        continue;
      }

      return response;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Upload attempt ${attempt + 1} failed:`, lastError.message);
      
      if (attempt >= retries) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Upload failed after retries');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Upload to Archive.org initiated');
    
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const fileName = formData.get('fileName') as string;
    const fileType = formData.get('fileType') as string;
    const chapterId = formData.get('chapterId') as string | null;
    const contentType = formData.get('contentType') as string;
    const contentId = formData.get('contentId') as string;
    
    if (!file || !fileName) {
      throw new Error('File and fileName are required');
    }

    const accessKey = Deno.env.get('ARCHIVE_ORG_ACCESS_KEY');
    const secretKey = Deno.env.get('ARCHIVE_ORG_SECRET_KEY');

    if (!accessKey || !secretKey) {
      throw new Error('Archive.org credentials not configured');
    }

    console.log(`Uploading file: ${fileName}, type: ${fileType}`);

    const itemIdentifier = 'qarray-educational-content';
    let folderPath: string;
    let metadataTitle: string;
    let additionalMetadata: Record<string, string> = {};
    
    // Sanitize names for URL use — normalize Unicode so accented characters
    // (é, è, à, ô, ç, …) become their ASCII equivalents instead of being
    // dropped, then replace any remaining non-alphanumerics with dashes.
    const sanitize = (str: string) =>
      str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
    // Encode metadata values to ASCII-safe format for HTTP headers
    const encodeForHeader = (str: string) => encodeURIComponent(str).replace(/%20/g, ' ');

    // Check if chapterId is provided for organized path
    if (chapterId) {
      // Initialize Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Fetch chapter, subject, and class information
      const { data: chapter, error: chapterError } = await supabase
        .from('chapters')
        .select('id, name, subject_id, class_id')
        .eq('id', parseInt(chapterId))
        .single();

      if (chapterError || !chapter) {
        throw new Error('Chapter not found');
      }

      const { data: subject, error: subjectError } = await supabase
        .from('subjects')
        .select('id, name')
        .eq('id', chapter.subject_id)
        .single();

      if (subjectError || !subject) {
        throw new Error('Subject not found');
      }

      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('id, name')
        .eq('id', chapter.class_id)
        .single();

      if (classError || !classData) {
        throw new Error('Class not found');
      }

      const className = sanitize(classData.name);
      const subjectName = sanitize(subject.name);
      const chapterName = sanitize(chapter.name);
      
      // Create organized folder path within the collection
      if (contentType && contentId) {
        // Full organization: class/subject/chapter/content-type/content-id/filename
        folderPath = `${className}/${subjectName}/${chapterName}/${contentType}/${contentId}/${fileName}`;
      } else {
        // Basic organization: class/subject/chapter/filename
        folderPath = `${className}/${subjectName}/${chapterName}/${fileName}`;
      }
      console.log(`Organized path: ${folderPath}`);
      
      metadataTitle = encodeForHeader(`${classData.name} - ${subject.name} - ${chapter.name}`);
      additionalMetadata = {
        'x-archive-meta-class': encodeForHeader(classData.name),
        'x-archive-meta-subject': encodeForHeader(subject.name),
        'x-archive-meta-chapter': encodeForHeader(chapter.name),
      };
      
      if (contentType) {
        additionalMetadata['x-archive-meta-content-type'] = encodeForHeader(contentType);
      }
      if (contentId) {
        additionalMetadata['x-archive-meta-content-id'] = encodeForHeader(contentId);
      }
    } else {
      // No chapterId - use generic uploads folder with timestamp
      const timestamp = Date.now();
      folderPath = `uploads/${timestamp}-${sanitize(fileName)}`;
      metadataTitle = encodeForHeader(`Upload - ${fileName}`);
      console.log(`Generic upload path: ${folderPath}`);
    }

    // Read file as array buffer
    const fileBuffer = await file.arrayBuffer();

    // Upload to Archive.org using S3-compatible API with retry logic

    // Upload to Archive.org using S3-compatible API with retry logic
    const uploadUrl = `https://s3.us.archive.org/${itemIdentifier}/${folderPath}`;
    
    const uploadHeaders = {
      'Authorization': `LOW ${accessKey}:${secretKey}`,
      'x-amz-auto-make-bucket': '1',
      'x-archive-meta-mediatype': fileType === 'audio' ? 'audio' : fileType === 'image' ? 'image' : 'texts',
      'x-archive-meta-collection': 'opensource',
      'x-archive-meta-title': metadataTitle,
      ...additionalMetadata,
      'Content-Type': file.type || 'application/octet-stream',
    };

    const uploadResponse = await uploadWithRetry(uploadUrl, uploadHeaders, fileBuffer);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Archive.org upload failed:', errorText);
      
      // Return appropriate status code for frontend retry handling
      const status = uploadResponse.status === 503 ? 429 : 500;
      return new Response(
        JSON.stringify({ 
          error: `Upload failed: ${uploadResponse.status} - ${errorText}`,
          retryable: uploadResponse.status >= 500,
        }),
        {
          status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const archiveUrl = `https://archive.org/download/${itemIdentifier}/${folderPath}`;
    console.log('Upload successful:', archiveUrl);

    return new Response(
      JSON.stringify({ 
        url: archiveUrl,
        itemIdentifier,
        fileName 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error uploading to Archive.org:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const isRetryable = errorMessage.includes('503') || errorMessage.includes('Rate limited');
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        retryable: isRetryable,
      }),
      {
        status: isRetryable ? 429 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
