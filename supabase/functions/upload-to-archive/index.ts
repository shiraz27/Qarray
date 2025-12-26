import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const contentType = formData.get('contentType') as string; // 'question' or 'resource'
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
    
    // Sanitize names for URL use
    const sanitize = (str: string) => str.replace(/[^a-z0-9]/gi, '-').toLowerCase();
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
    const fileBytes = new Uint8Array(fileBuffer);

    // Upload to Archive.org using S3-compatible API
    const uploadUrl = `https://s3.us.archive.org/${itemIdentifier}/${folderPath}`;
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `LOW ${accessKey}:${secretKey}`,
        'x-amz-auto-make-bucket': '1',
        'x-archive-meta-mediatype': fileType === 'audio' ? 'audio' : fileType === 'image' ? 'image' : 'texts',
        'x-archive-meta-collection': 'opensource',
        'x-archive-meta-title': metadataTitle,
        ...additionalMetadata,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: fileBytes,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Archive.org upload failed:', errorText);
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
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
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
