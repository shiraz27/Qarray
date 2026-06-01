import { supabase } from '@/integrations/supabase/client';

export interface ExtractedMetadata {
  school_name: string | null;
  teacher_name: string | null;
  suggested_title: string | null;
  suggested_type_id: number | null;
  suggested_devoir_type_id: number | null;
  suggested_description: string | null;
  teacher_names: string[];
  school_names: string[];
  books: string[];
}

export interface MetadataExtractionResult {
  success: boolean;
  metadata: ExtractedMetadata;
  message: string;
}

const EMPTY_METADATA: ExtractedMetadata = {
  school_name: null,
  teacher_name: null,
  suggested_title: null,
  suggested_type_id: null,
  suggested_devoir_type_id: null,
  suggested_description: null,
  teacher_names: [],
  school_names: [],
  books: [],
};

function normalizeMetadata(raw: any): ExtractedMetadata {
  const arr = (v: any): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : [];
  const teacher_names = arr(raw?.teacher_names);
  const school_names = arr(raw?.school_names);
  const books = arr(raw?.books);
  return {
    school_name: raw?.school_name ?? teacher_names[0] /* fallback never */ ?? null,
    teacher_name: raw?.teacher_name ?? null,
    suggested_title: raw?.suggested_title ?? null,
    suggested_type_id: raw?.suggested_type_id ?? null,
    suggested_devoir_type_id: raw?.suggested_devoir_type_id ?? null,
    suggested_description: raw?.suggested_description ?? null,
    teacher_names,
    school_names,
    books,
  };
}

/**
 * Extract metadata (school name, teacher name, suggested title, types, description) from OCR text using AI
 */
export async function extractMetadataFromOCR(
  ocrText: string,
  options?: { resourceId?: number; questionId?: number }
): Promise<MetadataExtractionResult> {
  try {
    if (!ocrText || ocrText.trim().length === 0) {
      return {
        success: true,
        metadata: { ...EMPTY_METADATA },
        message: 'No OCR text to analyze'
      };
    }

    const { data, error } = await supabase.functions.invoke('extract-metadata', {
      body: {
        ocrText,
        resourceId: options?.resourceId,
        questionId: options?.questionId
      }
    });

    if (error) {
      console.error('Error calling extract-metadata function:', error);
      return {
        success: false,
        metadata: { ...EMPTY_METADATA },
        message: error.message || 'Failed to extract metadata'
      };
    }

    return {
      success: data.success,
      metadata: normalizeMetadata(data.metadata),
      message: data.message || 'Metadata extraction complete'
    };
  } catch (error: any) {
    console.error('Error in extractMetadataFromOCR:', error);
    return {
      success: false,
      metadata: { ...EMPTY_METADATA },
      message: error.message || 'Unknown error during metadata extraction'
    };
  }
}

// Markers used to wrap auto-generated AI/OCR content inside descriptions.
// Anything between these markers is replaced on every retry so we never
// duplicate previously appended blocks.
export const AI_BLOCK_START = '<!-- ai-ocr:start -->';
export const AI_BLOCK_END = '<!-- ai-ocr:end -->';

/**
 * Build the auto-generated AI block (summary + key metadata) wrapped in
 * markers so it can be detected and replaced on subsequent runs.
 */
export function buildAiBlock(metadata: ExtractedMetadata): string {
  const lines: string[] = [];
  if (metadata.suggested_description && metadata.suggested_description.trim()) {
    lines.push(`🤖 ${metadata.suggested_description.trim()}`);
  }
  const meta: string[] = [];
  if (metadata.school_name) meta.push(`🏫 ${metadata.school_name}`);
  if (metadata.teacher_name) meta.push(`👨‍🏫 ${metadata.teacher_name}`);
  if (meta.length > 0) lines.push(meta.join(' | '));

  if (lines.length === 0) return '';
  return `${AI_BLOCK_START}\n${lines.join('\n\n')}\n${AI_BLOCK_END}`;
}

/**
 * Strip any previously-appended AI block from a description, leaving the
 * user's original content intact.
 */
export function stripAiBlock(description: string | null | undefined): string {
  if (!description) return '';
  const re = new RegExp(`\\n*${AI_BLOCK_START}[\\s\\S]*?${AI_BLOCK_END}\\n*`, 'g');
  return description.replace(re, '').trim();
}

/**
 * Merge the user's existing description with a freshly-built AI block,
 * replacing any previously appended block.
 */
export function mergeDescriptionWithAi(
  existingDescription: string | null | undefined,
  metadata: ExtractedMetadata
): string {
  const base = stripAiBlock(existingDescription);
  const block = buildAiBlock(metadata);
  if (!block) return base;
  return base ? `${base}\n\n${block}` : block;
}

/**
 * Backward-compatible helper used by older call sites.
 */
export function formatMetadataForDescription(
  metadata: ExtractedMetadata,
  existingDescription?: string
): string {
  return mergeDescriptionWithAi(existingDescription, metadata);
}

/**
 * Extract metadata and update resource fields
 */
export type MetadataField = 'title' | 'description' | 'teachers' | 'schools' | 'books' | 'types';

const mergeArrays = (existingArr: string[] | null | undefined, incoming: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...(existingArr || []), ...incoming]) {
    if (!v) continue;
    const k = v.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v.trim());
  }
  return out;
};

/**
 * Apply already-extracted metadata to a resource, restricted to `fields`.
 * Returns the updates actually applied (for UI patching).
 */
export async function applyResourceMetadata(
  resourceId: number,
  metadata: ExtractedMetadata,
  fields: MetadataField[],
): Promise<{ success: boolean; updates: Record<string, any>; message: string }> {
  if (fields.length === 0) {
    return { success: true, updates: {}, message: 'Nothing selected' };
  }
  const want = (f: MetadataField) => fields.includes(f);

  const { data: existing } = await supabase
    .from('resources')
    .select('description, teacher_names, school_names, books')
    .eq('id', resourceId)
    .maybeSingle();

  const updates: Record<string, any> = {};

  if (want('description')) {
    updates.description = mergeDescriptionWithAi(existing?.description, metadata);
  }
  if (want('title') && metadata.suggested_title) {
    updates.title = metadata.suggested_title;
  }
  if (want('teachers') && metadata.teacher_names.length > 0) {
    const merged = mergeArrays(existing?.teacher_names as string[] | null, metadata.teacher_names);
    updates.teacher_names = merged;
    updates.teacher_name = merged[0] ?? null;
  }
  if (want('schools') && metadata.school_names.length > 0) {
    const merged = mergeArrays(existing?.school_names as string[] | null, metadata.school_names);
    updates.school_names = merged;
    updates.school_name = merged[0] ?? null;
  }
  if (want('books') && metadata.books.length > 0) {
    const merged = mergeArrays(existing?.books as string[] | null, metadata.books);
    updates.books = merged;
    updates.book = merged[0] ?? null;
  }
  if (want('types')) {
    if (metadata.suggested_type_id) updates.type_id = metadata.suggested_type_id;
    if (metadata.suggested_devoir_type_id) updates.devoir_type_id = metadata.suggested_devoir_type_id;
  }

  if (Object.keys(updates).length === 0) {
    return { success: true, updates: {}, message: 'No applicable fields' };
  }

  const { error } = await supabase.from('resources').update(updates).eq('id', resourceId);
  if (error) {
    console.error('Error applying resource metadata:', error);
    return { success: false, updates: {}, message: 'Failed to update resource' };
  }
  return { success: true, updates, message: 'Applied' };
}

/**
 * Apply already-extracted metadata to a question, restricted to `fields`.
 */
export async function applyQuestionMetadata(
  questionId: number,
  metadata: ExtractedMetadata,
  fields: MetadataField[],
): Promise<{ success: boolean; updates: Record<string, any>; message: string }> {
  if (fields.length === 0) {
    return { success: true, updates: {}, message: 'Nothing selected' };
  }
  const want = (f: MetadataField) => fields.includes(f);

  const { data: existing } = await supabase
    .from('questions')
    .select('teacher_names, school_names, books')
    .eq('id', questionId)
    .maybeSingle();

  const updates: Record<string, any> = {};
  if (want('teachers') && metadata.teacher_names.length > 0) {
    updates.teacher_names = mergeArrays(existing?.teacher_names as string[] | null, metadata.teacher_names);
  }
  if (want('schools') && metadata.school_names.length > 0) {
    updates.school_names = mergeArrays(existing?.school_names as string[] | null, metadata.school_names);
  }
  if (want('books') && metadata.books.length > 0) {
    const merged = mergeArrays(existing?.books as string[] | null, metadata.books);
    updates.books = merged;
    updates.book = merged[0] ?? null;
  }
  if (want('types') && metadata.suggested_type_id) {
    updates.type_id = metadata.suggested_type_id;
  }

  if (Object.keys(updates).length === 0) {
    return { success: true, updates: {}, message: 'No applicable fields' };
  }

  const { error } = await supabase.from('questions').update(updates).eq('id', questionId);
  if (error) {
    console.error('Error applying question metadata:', error);
    return { success: false, updates: {}, message: 'Failed to update question' };
  }
  return { success: true, updates, message: 'Applied' };
}

export async function extractAndUpdateResourceMetadata(
  resourceId: number,
  ocrText: string,
  onProgress?: (message: string) => void,
  fields?: MetadataField[]
): Promise<MetadataExtractionResult> {
  onProgress?.('Extracting metadata with AI...');
  
  const result = await extractMetadataFromOCR(ocrText, { resourceId });
  
  if (!result.success) {
    return result;
  }

  const want = (f: MetadataField) => !fields || fields.includes(f);
  onProgress?.('Updating resource with extracted metadata...');

  const { data: existing } = await supabase
    .from('resources')
    .select('description, teacher_names, school_names, books')
    .eq('id', resourceId)
    .maybeSingle();

  const updates: Record<string, any> = {};

  if (want('description')) {
    updates.description = mergeDescriptionWithAi(existing?.description, result.metadata);
  }

  if (want('title') && result.metadata.suggested_title) {
    updates.title = result.metadata.suggested_title;
  }

  const mergeArrays = (existingArr: string[] | null | undefined, incoming: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of [...(existingArr || []), ...incoming]) {
      if (!v) continue;
      const k = v.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(v.trim());
    }
    return out;
  };

  if (want('teachers') && result.metadata.teacher_names.length > 0) {
    const merged = mergeArrays(existing?.teacher_names as string[] | null, result.metadata.teacher_names);
    updates.teacher_names = merged;
    updates.teacher_name = merged[0] ?? null;
  }
  if (want('schools') && result.metadata.school_names.length > 0) {
    const merged = mergeArrays(existing?.school_names as string[] | null, result.metadata.school_names);
    updates.school_names = merged;
    updates.school_name = merged[0] ?? null;
  }
  if (want('books') && result.metadata.books.length > 0) {
    const merged = mergeArrays(existing?.books as string[] | null, result.metadata.books);
    updates.books = merged;
    updates.book = merged[0] ?? null;
  }
  if (want('types')) {
    if (result.metadata.suggested_type_id) updates.type_id = result.metadata.suggested_type_id;
    if (result.metadata.suggested_devoir_type_id) updates.devoir_type_id = result.metadata.suggested_devoir_type_id;
  }

  if (Object.keys(updates).length === 0) {
    return { ...result, message: 'No metadata to update' };
  }

  const { error } = await supabase
    .from('resources')
    .update(updates)
    .eq('id', resourceId);

  if (error) {
    console.error('Error updating resource metadata:', error);
    return {
      ...result,
      success: false,
      message: 'Failed to update resource metadata',
    };
  }
  
  // Build result message
  const foundItems: string[] = [];
  if (result.metadata.suggested_title) foundItems.push(`Title: ${result.metadata.suggested_title}`);
  if (result.metadata.school_names.length) foundItems.push(`Schools: ${result.metadata.school_names.length}`);
  if (result.metadata.teacher_names.length) foundItems.push(`Teachers: ${result.metadata.teacher_names.length}`);
  if (result.metadata.books.length) foundItems.push(`Books: ${result.metadata.books.length}`);
  if (result.metadata.suggested_type_id) foundItems.push(`Type: ${result.metadata.suggested_type_id}`);
  if (result.metadata.suggested_devoir_type_id) foundItems.push(`Devoir: ${result.metadata.suggested_devoir_type_id}`);
  if (result.metadata.suggested_description) foundItems.push(`Description generated`);
  
  if (foundItems.length > 0) {
    return {
      ...result,
      message: `Found: ${foundItems.join(', ')}`
    };
  }
  
  return {
    ...result,
    message: 'No metadata detected'
  };
}

/**
 * Apply suggested title to a resource
 */
export async function applySuggestedTitle(
  resourceId: number,
  suggestedTitle: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from('resources')
      .update({ title: suggestedTitle })
      .eq('id', resourceId);
    
    if (error) {
      console.error('Error applying suggested title:', error);
      return { success: false, message: 'Failed to update title' };
    }
    
    return { success: true, message: 'Title updated successfully' };
  } catch (error: any) {
    console.error('Error in applySuggestedTitle:', error);
    return { success: false, message: error.message || 'Unknown error' };
  }
}

/**
 * Extract metadata and update question (if needed in future)
 */
export async function extractAndUpdateQuestionMetadata(
  questionId: number,
  ocrText: string,
  onProgress?: (message: string) => void,
  fields?: MetadataField[]
): Promise<MetadataExtractionResult> {
  onProgress?.('Extracting metadata with AI...');

  const result = await extractMetadataFromOCR(ocrText, { questionId });
  if (!result.success) return result;

  const want = (f: MetadataField) => !fields || fields.includes(f);

  const { data: existing } = await supabase
    .from('questions')
    .select('teacher_names, school_names, books')
    .eq('id', questionId)
    .maybeSingle();

  const mergeArrays = (existingArr: string[] | null | undefined, incoming: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of [...(existingArr || []), ...incoming]) {
      if (!v) continue;
      const k = v.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(v.trim());
    }
    return out;
  };

  const updates: Record<string, any> = {};
  if (want('teachers') && result.metadata.teacher_names.length > 0) {
    updates.teacher_names = mergeArrays(existing?.teacher_names as string[] | null, result.metadata.teacher_names);
  }
  if (want('schools') && result.metadata.school_names.length > 0) {
    updates.school_names = mergeArrays(existing?.school_names as string[] | null, result.metadata.school_names);
  }
  if (want('books') && result.metadata.books.length > 0) {
    const merged = mergeArrays(existing?.books as string[] | null, result.metadata.books);
    updates.books = merged;
    updates.book = merged[0] ?? null;
  }
  if (want('types') && result.metadata.suggested_type_id) {
    updates.type_id = result.metadata.suggested_type_id;
  }

  if (Object.keys(updates).length === 0) return { ...result, message: 'No metadata to update' };

  const { error } = await supabase.from('questions').update(updates).eq('id', questionId);
  if (error) {
    console.error('Error updating question metadata:', error);
    return { ...result, success: false, message: 'Failed to update question metadata' };
  }

  const foundItems: string[] = [];
  if (result.metadata.school_names.length) foundItems.push(`Schools: ${result.metadata.school_names.length}`);
  if (result.metadata.teacher_names.length) foundItems.push(`Teachers: ${result.metadata.teacher_names.length}`);
  if (result.metadata.books.length) foundItems.push(`Books: ${result.metadata.books.length}`);
  return { ...result, message: foundItems.length ? `Found: ${foundItems.join(', ')}` : 'No metadata detected' };
}
