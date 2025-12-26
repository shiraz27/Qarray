import { supabase } from '@/integrations/supabase/client';

export interface ExtractedMetadata {
  school_name: string | null;
  teacher_name: string | null;
}

export interface MetadataExtractionResult {
  success: boolean;
  metadata: ExtractedMetadata;
  message: string;
}

/**
 * Extract metadata (school name, teacher name) from OCR text using AI
 */
export async function extractMetadataFromOCR(
  ocrText: string,
  options?: { resourceId?: number; questionId?: number }
): Promise<MetadataExtractionResult> {
  try {
    if (!ocrText || ocrText.trim().length === 0) {
      return {
        success: true,
        metadata: { school_name: null, teacher_name: null },
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
        metadata: { school_name: null, teacher_name: null },
        message: error.message || 'Failed to extract metadata'
      };
    }

    return {
      success: data.success,
      metadata: data.metadata || { school_name: null, teacher_name: null },
      message: data.message || 'Metadata extraction complete'
    };
  } catch (error: any) {
    console.error('Error in extractMetadataFromOCR:', error);
    return {
      success: false,
      metadata: { school_name: null, teacher_name: null },
      message: error.message || 'Unknown error during metadata extraction'
    };
  }
}

/**
 * Format extracted metadata into a description string
 */
export function formatMetadataForDescription(
  metadata: ExtractedMetadata,
  existingDescription?: string
): string {
  const parts: string[] = [];
  
  if (existingDescription && existingDescription.trim()) {
    parts.push(existingDescription.trim());
  }
  
  const metadataParts: string[] = [];
  if (metadata.school_name) {
    metadataParts.push(`🏫 ${metadata.school_name}`);
  }
  if (metadata.teacher_name) {
    metadataParts.push(`👨‍🏫 ${metadata.teacher_name}`);
  }
  
  if (metadataParts.length > 0) {
    parts.push(metadataParts.join(' | '));
  }
  
  return parts.join('\n\n');
}

/**
 * Extract metadata and update resource description
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
  
  // Only update if we found something
  if (school_name || teacher_name) {
    onProgress?.('Updating resource with extracted metadata...');
    
    const { error } = await supabase
      .from('resources')
      .update({ 
        school_name: school_name || null,
        teacher_name: teacher_name || null
      })
      .eq('id', resourceId);
    
    if (error) {
      console.error('Error updating resource metadata:', error);
      return {
        ...result,
        success: false,
        message: 'Failed to update resource metadata'
      };
    }
    
    return {
      ...result,
      message: `Found: ${school_name ? `School: ${school_name}` : ''}${school_name && teacher_name ? ', ' : ''}${teacher_name ? `Teacher: ${teacher_name}` : ''}`
    };
  }
  
  return {
    ...result,
    message: 'No school or teacher name detected'
  };
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
