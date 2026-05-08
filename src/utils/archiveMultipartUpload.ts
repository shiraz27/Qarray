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

export interface ArchiveUploadController {
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  isPaused: () => boolean;
}

export interface ArchiveUploadHandle {
  promise: Promise<{ url: string }>;
  controller: ArchiveUploadController;
}

const MULTIPART_THRESHOLD = 16 * 1024 * 1024; // 16 MB
const PART_SIZE = 8 * 1024 * 1024; // 8 MB
const CONCURRENCY = 4;
const MAX_PART_RETRIES = 3;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function invokeFn<T = any>(body: FormData | Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('upload-to-archive', { body: body as any });
  if (error) throw new Error(error.message || 'Edge function error');
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

// Single PUT via edge function (small files only).
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

  const data = await invokeFn<{ url: string }>(formData);
  if (!data?.url) throw new Error('No URL returned from upload');
  onProgress?.({ loaded: file.size, total: file.size, ratio: 1 });
  return { url: data.url };
}

// Direct browser PUT to a presigned URL with real upload progress + abort support.
function putPartXhr(
  url: string,
  blob: Blob,
  onProgress: (loadedForThisPart: number) => void,
  signal: AbortSignal,
): Promise<string /* etag */> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag') || '';
        if (!etag) {
          reject(new Error('Missing ETag in response'));
          return;
        }
        resolve(etag);
      } else {
        const err: any = new Error(`Part upload failed: ${xhr.status} ${xhr.statusText}`);
        err.status = xhr.status;
        err.retryable = xhr.status >= 500 || xhr.status === 429;
        reject(err);
      }
    };
    xhr.onerror = () => {
      const err: any = new Error('Network error during part upload');
      err.retryable = true;
      reject(err);
    };
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    const abortHandler = () => {
      try { xhr.abort(); } catch { /* noop */ }
    };
    signal.addEventListener('abort', abortHandler, { once: true });
    xhr.send(blob);
  });
}

interface PartPlan {
  partNumber: number;
  start: number;
  end: number;
}

async function multipartUpload(
  file: File,
  options: ArchiveUploadOptions,
  onProgress: ((p: ArchiveUploadProgress) => void) | undefined,
  state: { paused: boolean; cancelled: boolean; resumeWaiters: Array<() => void>; currentSignal: AbortController },
): Promise<{ url: string }> {
  // 1. Initiate
  const init = await invokeFn<{ uploadId: string; key: string; finalUrl: string }>({
    action: 'initiate',
    fileName: options.fileName,
    fileType: options.fileType,
    chapterId: options.chapterId !== undefined ? String(options.chapterId) : undefined,
    contentType: options.contentType,
    contentId: options.contentId,
    mimeType: file.type || 'application/octet-stream',
  });
  const { uploadId, key } = init;

  // Build part plan
  const totalParts = Math.ceil(file.size / PART_SIZE);
  const plan: PartPlan[] = [];
  for (let i = 0; i < totalParts; i++) {
    const start = i * PART_SIZE;
    const end = Math.min(start + PART_SIZE, file.size);
    plan.push({ partNumber: i + 1, start, end });
  }

  const completedParts = new Map<number, string>(); // partNumber -> etag
  const bytesByPart = new Map<number, number>(); // partNumber -> bytes uploaded so far
  const completedBytesBase = () => {
    let total = 0;
    for (const [n, etag] of completedParts) {
      if (etag) total += plan[n - 1].end - plan[n - 1].start;
    }
    return total;
  };

  const emitProgress = () => {
    let inflight = 0;
    for (const [n, b] of bytesByPart) {
      if (!completedParts.has(n)) inflight += b;
    }
    const loaded = completedBytesBase() + inflight;
    onProgress?.({ loaded, total: file.size, ratio: file.size === 0 ? 1 : loaded / file.size });
  };

  let nextIndex = 0;
  const takeNext = (): PartPlan | null => {
    while (nextIndex < plan.length) {
      const p = plan[nextIndex++];
      if (!completedParts.has(p.partNumber)) return p;
    }
    return null;
  };

  const waitIfPaused = async () => {
    while (state.paused && !state.cancelled) {
      await new Promise<void>((resolve) => state.resumeWaiters.push(resolve));
    }
  };

  let fatalError: any = null;

  const worker = async () => {
    while (true) {
      if (state.cancelled) return;
      await waitIfPaused();
      if (state.cancelled) return;
      const part = takeNext();
      if (!part) return;

      let attempt = 0;
      while (true) {
        if (state.cancelled) return;
        await waitIfPaused();
        if (state.cancelled) return;
        try {
          // Sign this part (cheap JSON call)
          const signed = await invokeFn<{ url: string }>({
            action: 'sign-part',
            key,
            uploadId,
            partNumber: part.partNumber,
          });
          const blob = file.slice(part.start, part.end);
          bytesByPart.set(part.partNumber, 0);
          const etag = await putPartXhr(
            signed.url,
            blob,
            (loaded) => {
              bytesByPart.set(part.partNumber, loaded);
              emitProgress();
            },
            state.currentSignal.signal,
          );
          completedParts.set(part.partNumber, etag);
          bytesByPart.set(part.partNumber, part.end - part.start);
          emitProgress();
          break; // part done
        } catch (err: any) {
          // Aborted because of pause/cancel -> loop will re-check state
          if (err?.name === 'AbortError') {
            bytesByPart.delete(part.partNumber);
            if (state.cancelled) return;
            // paused: loop and wait
            continue;
          }
          attempt++;
          if (attempt > MAX_PART_RETRIES) {
            fatalError = err;
            state.cancelled = true;
            try { state.currentSignal.abort(); } catch { /* noop */ }
            return;
          }
          await delay(Math.min(30000, Math.pow(2, attempt) * 1000));
        }
      }
    }
  };

  const workerCount = Math.min(CONCURRENCY, plan.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  if (fatalError) {
    // Best-effort abort on archive.org
    try {
      await invokeFn({ action: 'abort', key, uploadId });
    } catch (e) {
      console.warn('Abort failed (ignored):', e);
    }
    throw fatalError;
  }

  if (state.cancelled) {
    try {
      await invokeFn({ action: 'abort', key, uploadId });
    } catch { /* noop */ }
    throw new DOMException('Upload cancelled', 'AbortError');
  }

  // All parts done -> complete
  const parts = Array.from(completedParts.entries())
    .map(([partNumber, etag]) => ({ partNumber, etag }))
    .sort((a, b) => a.partNumber - b.partNumber);

  const completed = await invokeFn<{ url: string }>({
    action: 'complete',
    key,
    uploadId,
    parts,
  });
  if (!completed?.url) throw new Error('No URL returned from complete');
  return { url: completed.url };
}

/**
 * Upload a file to Archive.org.
 * - Files < 16 MB: single PUT proxied through the edge function (legacy).
 * - Files >= 16 MB: multipart with direct browser-to-archive.org PUTs via
 *   presigned URLs. Parallel parts (CONCURRENCY=4), real per-byte progress,
 *   pause/resume/cancel via the returned controller.
 *
 * Returns a handle with `{ promise, controller }`. Awaiting `promise` gives the
 * final `{ url }`. The controller is a no-op for files below the multipart
 * threshold (single PUT has no useful pause point).
 */
export function uploadFileToArchiveControlled(
  file: File,
  options: ArchiveUploadOptions,
  onProgress?: (p: ArchiveUploadProgress) => void,
): ArchiveUploadHandle {
  const state = {
    paused: false,
    cancelled: false,
    resumeWaiters: [] as Array<() => void>,
    currentSignal: new AbortController(),
  };

  const controller: ArchiveUploadController = {
    pause: () => {
      if (state.cancelled || state.paused) return;
      state.paused = true;
      try { state.currentSignal.abort(); } catch { /* noop */ }
    },
    resume: () => {
      if (state.cancelled || !state.paused) return;
      state.paused = false;
      // Fresh signal so future XHRs aren't pre-aborted
      state.currentSignal = new AbortController();
      const waiters = state.resumeWaiters.splice(0);
      waiters.forEach((w) => w());
    },
    cancel: () => {
      state.cancelled = true;
      state.paused = false;
      try { state.currentSignal.abort(); } catch { /* noop */ }
      const waiters = state.resumeWaiters.splice(0);
      waiters.forEach((w) => w());
    },
    isPaused: () => state.paused,
  };

  const promise = (async () => {
    if (file.size >= MULTIPART_THRESHOLD) {
      return multipartUpload(file, options, onProgress, state);
    }
    // Small files: legacy single PUT (no real pause/resume)
    return singleUpload(file, options, onProgress);
  })();

  return { promise, controller };
}

/** Backwards-compatible API: returns just the final URL. */
export async function uploadFileToArchive(
  file: File,
  options: ArchiveUploadOptions,
  onProgress?: (p: ArchiveUploadProgress) => void,
): Promise<{ url: string }> {
  const { promise } = uploadFileToArchiveControlled(file, options, onProgress);
  return promise;
}
