## What's already done
- **Migration applied**: `resources.description_proposed*` columns added, `ai_generations` uniqueness now per `(target,kind,model)` so multiple models can run side-by-side (the per-action model picker the UI was already showing now actually persists multiple rows).

## What this build does

### 1. Unified left-side media gallery
- **New** `src/components/MediaGallery.tsx` — sidebar (desktop) / horizontal strip (mobile) listing all attachments with per-type thumbs:
  - PDF / split-PDF manifest → first-page canvas thumb via pdfjs + page count
  - Image → proxied `<img>` thumb
  - Video → Film icon; Audio → Music icon; unknown → File icon
  - Active row highlighted; single attachment skips chrome and just renders the preview.
- **Edit** `src/components/MediaList.tsx` — replace split PDF viewer + others grid with one `<MediaGallery items={media} />`.

### 2. OCR readability badges in review/edit UI
- **Edit** `src/components/statistics/OcrReviewButton.tsx` — accept new `currentReadability` prop; render colored readability `Badge` (green/yellow/orange/red via existing `readabilityBadgeClass`) in both the **Current** and **Proposed** pane headers and inline near the dialog title.
- **Edit** `src/components/statistics/OcrTextEditor.tsx` — accept new `readability` prop; render the same badge in the popover header and as a small chip next to the inline preview button.
- **Edit** `src/pages/Statistics.tsx` (2 OcrReviewButton sites + the OcrTextEditor sites for resources and questions) — pass `currentReadability={row.ocr_readability}` and `readability={row.ocr_readability}`.

### 3. "Generate description with AI" button (admin, resource rows)
- **Edit** `supabase/functions/ai-generate/index.ts` — add a top-level branch in `Deno.serve` for `body.action === 'describe_resource'`:
  - Validates moderator/admin, loads the resource (title + existing description + ocr_text + book/teacher/school metadata).
  - Calls `callModel` with `google/gemini-2.5-flash` (default; caller may pass `model`), system prompt: "Write a 2-3 sentence French study description of this resource for Tunisian students. No greeting, no self-intro, plain text."
  - If `resources.description` already has real content (≥20 chars), writes the output to `description_proposed` + `description_proposed_at` + `description_proposed_status='pending'` + `description_proposed_model`.
  - Otherwise writes directly to `description`.
  - Does NOT touch `ai_generations` or create a bot answer — descriptions live on the resource row.
- **New** `src/components/statistics/DescriptionAiButton.tsx`:
  - Small "AI describe" button on each resource row (admin-only, only when `ocr_text` is non-empty since we need source material).
  - Calls the edge function. On success refetches the row.
  - If a `description_proposed` exists, also renders a "Review proposed description" diff dialog (reuses `diffWords`/`diffStats` from `@/utils/textDiff`) with Approve / Discard buttons that update `resources` directly.
- **Edit** `src/pages/Statistics.tsx` — drop `<DescriptionAiButton>` into the resource action cell (next to the existing "Extract metadata with AI" button); add the new `description_proposed*` fields to the resource fetch select and `ResourceRow` interface.

### Files touched
- New: `src/components/MediaGallery.tsx`, `src/components/statistics/DescriptionAiButton.tsx`
- Edit: `src/components/MediaList.tsx`, `src/components/statistics/OcrReviewButton.tsx`, `src/components/statistics/OcrTextEditor.tsx`, `src/pages/Statistics.tsx`, `supabase/functions/ai-generate/index.ts`

### Out of scope
- OCR engine tuning (DPI / binarization / `tessdata_best`) is deferred — current French/Arabic/English language detection + 3× upscale on small pages is already in place; further quality work warrants its own iteration with sample documents.
- No changes to AiGenerationsCard (the model picker already exists; the migration just unblocked its multi-model persistence).
