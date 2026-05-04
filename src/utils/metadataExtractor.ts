import { supabase } from '@/integrations/supabase/client';

export interface ExtractedMetadata {
  school_name: string | null;
  teacher_name: string | null;
  suggested_title: string | null;
  suggested_type_id: number | null;
  suggested_devoir_type_id: number | null;
  suggested_description: string | null;
}

export interface MetadataExtractionResult {
  success: boolean;
  metadata: ExtractedMetadata;
  message: string;
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
        metadata: { 
          school_name: null, 
          teacher_name: null, 
          suggested_title: null, 
          suggested_type_id: null, 
          suggested_devoir_type_id: null,
          suggested_description: null
        },
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
        metadata: { 
          school_name: null, 
          teacher_name: null, 
          suggested_title: null, 
          suggested_type_id: null, 
          suggested_devoir_type_id: null,
          suggested_description: null
        },
        message: error.message || 'Failed to extract metadata'
      };
    }

    return {
      success: data.success,
      metadata: data.metadata || { 
        school_name: null, 
        teacher_name: null, 
        suggested_title: null, 
        suggested_type_id: null, 
        suggested_devoir_type_id: null,
        suggested_description: null
      },
      message: data.message || 'Metadata extraction complete'
    };
  } catch (error: any) {
    console.error('Error in extractMetadataFromOCR:', error);
    return {
      success: false,
      metadata: { 
        school_name: null, 
        teacher_name: null, 
        suggested_title: null, 
        suggested_type_id: null, 
        suggested_devoir_type_id: null,
        suggested_description: null
      },
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
export async function extractAndUpdateResourceMetadata(
  resourceId: number,
  ocrText: string,
  onProgress?: (message: string) => void
): Promise<MetadataExtractionResult> {
  onProgress?.('Extracting metadata with AI...');
  
  const result = await extractMetadataFromOCR(ocrText, { resourceId });
  
  if (!result.success) {
    return result;
  }
  
  const { school_name, teacher_name } = result.metadata;
  
  // Only update if we found school or teacher name
  // Update structured fields + merge AI block into description.
  onProgress?.('Updating resource with extracted metadata...');

  // Fetch the existing description so we can preserve user-authored text
  // and replace any prior AI block.
  const { data: existing } = await supabase
    .from('resources')
    .select('description')
    .eq('id', resourceId)
    .maybeSingle();

  const newDescription = mergeDescriptionWithAi(existing?.description, result.metadata);

  const updates: Record<string, any> = {
    description: newDescription,
  };
  if (school_name) updates.school_name = school_name;
  if (teacher_name) updates.teacher_name = teacher_name;

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
  if (school_name) foundItems.push(`School: ${school_name}`);
  if (teacher_name) foundItems.push(`Teacher: ${teacher_name}`);
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
  onProgress?: (message: string) => void
): Promise<MetadataExtractionResult> {
  onProgress?.('Extracting metadata with AI...');
  
  const result = await extractMetadataFromOCR(ocrText, { questionId });
  
  // For questions, we just return the result without updating
  // since questions don't have a description field
  return result;
}
