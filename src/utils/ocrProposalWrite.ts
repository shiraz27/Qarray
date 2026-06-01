import { supabase } from '@/integrations/supabase/client';
import { computeReadability } from '@/utils/ocrReadability';

type Table = 'resources' | 'questions';

/**
 * A previously-saved `ocr_text` qualifies as "real" content that must be
 * protected from automatic overwrite. Status messages we wrote ourselves
 * ("No media files found", "Error: …", etc.) do not.
 */
function isRealOcrContent(text: string | null | undefined, status: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 20) return false;
  // Only protect text from successful completed runs.
  if (status !== 'completed') return false;
  return true;
}

/**
 * Write OCR results respecting the proposal flow:
 *   - If a prior `completed` ocr_text exists, store the new run as a
 *     proposal (admin must approve before it replaces the live value).
 *   - Otherwise write directly to ocr_text/ocr_status.
 *
 * `failed` results bypass the proposal flow (no point gating an error
 * behind review) and always write directly.
 */
export async function writeOcrResult(
  table: Table,
  rowId: number,
  result: { status: 'completed' | 'not_applicable' | 'failed'; text: string },
): Promise<{ proposed: boolean }> {
  const now = new Date().toISOString();
  const readability = computeReadability(result.text);

  // For failed/non-applicable runs we keep the existing direct-write
  // behavior so admins still see the error/retry signal immediately.
  if (result.status !== 'completed') {
    await (supabase as any)
      .from(table)
      .update({
        ocr_status: result.status,
        ocr_text: result.text,
        ocr_readability: readability,
        ocr_processed_at: now,
      })
      .eq('id', rowId);
    return { proposed: false };
  }

  // Successful run: check whether the row already has real OCR content.
  const { data: existing } = await (supabase as any)
    .from(table)
    .select('ocr_text, ocr_status')
    .eq('id', rowId)
    .single();

  if (isRealOcrContent(existing?.ocr_text, existing?.ocr_status)) {
    // Identical output? Don't bother creating a proposal.
    if ((existing.ocr_text ?? '').trim() === result.text.trim()) {
      await (supabase as any)
        .from(table)
        .update({
          ocr_text_proposed: null,
          ocr_text_proposed_at: null,
          ocr_text_proposed_readability: null,
          ocr_text_proposed_status: null,
          ocr_processed_at: now,
        })
        .eq('id', rowId);
      return { proposed: false };
    }

    await (supabase as any)
      .from(table)
      .update({
        ocr_text_proposed: result.text,
        ocr_text_proposed_status: result.status,
        ocr_text_proposed_readability: readability,
        ocr_text_proposed_at: now,
      })
      .eq('id', rowId);
    return { proposed: true };
  }

  // First-time / non-completed prior: write directly.
  await (supabase as any)
    .from(table)
    .update({
      ocr_status: result.status,
      ocr_text: result.text,
      ocr_readability: readability,
      ocr_processed_at: now,
      // Clear any stale proposal that was sitting around.
      ocr_text_proposed: null,
      ocr_text_proposed_at: null,
      ocr_text_proposed_readability: null,
      ocr_text_proposed_status: null,
    })
    .eq('id', rowId);
  return { proposed: false };
}