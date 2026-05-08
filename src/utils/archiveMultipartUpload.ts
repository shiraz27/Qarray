import { supabase } from '@/integrations/supabase/client';

export interface ArchiveUploadOptions {
  fileName: string;
  fileType: 'image' | 'audio' | 'pdf' | string;
  chapterId?: number | string;
  contentType?: string;
  contentId?: string;
}

export interface ArchiveUploadProgress {
  loaded: number;
  total: number;
  ratio: number; // 0..1
}

const MULTIPART_THRESHOLD = 16 * 1024 * 1024; // 16 MB
const PART_SIZE = 8 * 1024 * 1024; // 8 MB
const MAX_PART_RETRIES = 3;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function invokeWithRetry<T = any>(
  body: FormData | Record<string, unknown>,
  retries = MAX_PART_RETRIES,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        await delay(Math.pow(2, attempt) * 1000);
      }
      const { data, error } = await supabase.functions.invoke('upload-to-archive', { body: body as any });
      if (error) throw new Error(error.message || 'Upload failed');
      if (data?.error) throw new Error(data.error);
      return data as T;
    } catch (e: any) {
      lastError = e;
      if (e?.message?.includes('credentials not configured')) throw e;
    }
  }
  throw lastError || new Error('Upload failed after retries');
}

async function singleUpload(
  file: File,
  options: ArchiveUploadOptions,
  onProgress?: (p: ArchiveUploadProgress) => void,
): Promise<{ url: string }> {
  onProgress?.({ loaded: 0, total: file.size, ratio: 0 });
  const formData = new FormData();
  formData.append('action', 'single');
  formData.append('file', file);
  formData.append('fileName', options.fileName);
  formData.append('fileType', options.fileType);
  if (options.chapterId !== undefined && options.chapterId !== null) {
    formData.append('chapterId', String(options.chapterId));
  }
  if (options.contentType) formData.append('contentType', options.contentType);
  if (options.contentId) formData.append('contentId', options.contentId);

  const data = await invokeWithRetry<{ url: string }>(formData);
  if (!data?.url) throw new Error('No URL returned from upload');
  onProgress?.({ loaded: file.size, total: file.size, ratio: 1 });
  return { url: data.url };
}

async function multipartUpload(
  file: File,
  options: ArchiveUploadOptions,
  onProgress?: (p: ArchiveUploadProgress) => void,
): Promise<{ url: string }> {
  // 1. Initiate
  const init = await invokeWithRetry<{ uploadId: string; key: string; finalUrl: string }>({
    action: 'initiate',
    fileName: options.fileName,
    fileType: options.fileType,
    chapterId: options.chapterId !== undefined ? String(options.chapterId) : undefined,
    contentType: options.contentType,
    contentId: options.contentId,
    mimeType: file.type || 'application/octet-stream',
  });

  const { uploadId, key } = init;
  const totalParts = Math.ceil(file.size / PART_SIZE);
  const parts: Array<{ partNumber: number; etag: string }> = [];
  let loaded = 0;

  try {
    for (let i = 0; i < totalParts; i++) {
      const start = i * PART_SIZE;
      const end = Math.min(start + PART_SIZE, file.size);
      const blob = file.slice(start, end);
      const partNumber = i + 1;

      const fd = new FormData();
      fd.append('action', 'upload-part');
      fd.append('key', key);
      fd.append('uploadId', uploadId);
      fd.append('partNumber', String(partNumber));
      fd.append('chunk', blob, `part-${partNumber}`);

      const partResp = await invokeWithRetry<{ partNumber: number; etag: string }>(fd);
      if (!partResp?.etag) throw new Error(`Part ${partNumber} missing ETag`);

      parts.push({ partNumber: partResp.partNumber, etag: partResp.etag });
      loaded += end - start;
      onProgress?.({ loaded, total: file.size, ratio: loaded / file.size });
    }

    // 3. Complete
    const completed = await invokeWithRetry<{ url: string }>({
      action: 'complete',
      key,
      uploadId,
      parts,
    });
    if (!completed?.url) throw new Error('No URL returned from complete');
    return { url: completed.url };
  } catch (err) {
    // Best-effort abort
    try {
      await supabase.functions.invoke('upload-to-archive', {
        body: { action: 'abort', key, uploadId } as any,
      });
    } catch (abortErr) {
      console.warn('Abort failed (ignored):', abortErr);
    }
    throw err;
  }
}

/**
 * Upload a file to Archive.org via the upload-to-archive edge function.
 * Uses S3 multipart upload for files >= 16 MB, single PUT otherwise.
 */
export async function uploadFileToArchive(
  file: File,
  options: ArchiveUploadOptions,
  onProgress?: (p: ArchiveUploadProgress) => void,
): Promise<{ url: string }> {
  if (file.size >= MULTIPART_THRESHOLD) {
    return multipartUpload(file, options, onProgress);
  }
  return singleUpload(file, options, onProgress);
}
