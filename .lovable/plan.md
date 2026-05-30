## Problem

Two related bugs in the AI answers feature:

1. **Refusal text saved as a valid AI answer.** When the upstream model (e.g. `deepseek/deepseek-r1-0528:free`) replies with a refusal like *"Je suis désolé, mais la demande de l'utilisateur dépasse la capacité maximale de 1000 tokens..."*, `ai-generate` treats it as a normal successful completion and stores it as an `answers` row + marks the `ai_generations` row `completed`. The HTTP call succeeded, so no try/catch fires.
2. **AI answers on resources are read-only.** On `ResourceDetail`, AI insights render via `AiAnswerRenderer` with no edit/delete controls. Even admins/moderators cannot remove the bad comment. (On `QuestionDetail` edit/delete already work for moderators — that path is fine.)

## Fix

### 1. Detect refusals / truncation in `supabase/functions/ai-generate/index.ts`

In `runGeneration`, after `callModel(...)` returns `content`:

- For non-infographic kinds, run a `looksLikeRefusal(content)` check that flags responses which are:
  - too short (< 80 chars after trim), OR
  - match common refusal/limit patterns (case-insensitive, FR + EN + AR), e.g.
    - `je suis désolé`, `je ne peux pas`, `dépasse la capacité`, `limite de tokens`, `maximum de tokens`
    - `i'm sorry`, `i cannot`, `i can't`, `exceeds the maximum`, `token limit`, `maximum context`
    - `أعتذر`, `لا أستطيع`, `تجاوز الحد`
- For `infographic`, additionally treat "no `<svg>` tag found" as a refusal (today it silently wraps the text in a fake SVG — replace that fallback with a failure).
- When a refusal is detected:
  - Do NOT insert/update the `answers` row.
  - Mark `ai_generations` as `status='failed'` with `error='Model refused or returned non-answer (likely token/context limit)'`.
  - Return `{ status: 'failed', error: ... }` so the Statistics panel surfaces it like any other failure (and the operator can retry with a smaller input / different model).
- Keep the existing happy path unchanged for real answers.

This addresses the root cause (a bad response should never become a comment), independent of model choice.

### 2. Allow mods/admins to edit + delete AI answers on `ResourceDetail`

Update `src/pages/ResourceDetail.tsx` (the `AI Insights` block, lines ~964–977):

- Read `isModerator` from `useUserRole` (already imported elsewhere in the page or add the import).
- When `isModerator` is true, render two small ghost buttons next to each AI insight card:
  - **Delete** → `AlertDialog` confirm → `supabase.from('answers').update({ deleted: true }).eq('id', a.id)` (soft delete, consistent with the rest of the app per project memory), then filter it out of local `aiAnswers` state. Also best-effort clear the link from `ai_generations` so a re-run can produce a fresh row: `supabase.from('ai_generations').update({ output_answer_id: null, status: 'failed', error: 'Deleted by moderator' }).eq('output_answer_id', a.id)`.
  - **Edit** → opens a `Dialog` with a simple controlled `Textarea` pre-filled with the parsed `payload.content` (or raw `a.data` for infographic). On save, rebuild the JSON payload preserving `ai_kind`, `language`, `model`, `svg` (for infographic), update `answers.data`, and refresh local state. (We don't reuse `EditAnswerForm` because that one is built around question/chapter media-attachments, not the AI JSON envelope.)
- No changes needed to `QuestionDetail` — its existing `canEditAnswer` already grants moderators edit + delete for AI answers too.

### 3. No DB migration needed

Soft delete + `ai_generations` update use existing columns. RLS already allows moderators (via existing answer policies); if a permission error surfaces during testing we'll route the delete through the `admin-delete` edge function instead — but the expectation is the current policies are sufficient.

## Out of scope

- Changing the underlying model or `max_tokens` (the user did not ask to change AI providers; refusal detection covers all models).
- Reworking the bot-comment authoring flow.

## Technical notes

- Files touched:
  - `supabase/functions/ai-generate/index.ts` — add `looksLikeRefusal`, branch in `runGeneration`, drop silent infographic fallback.
  - `src/pages/ResourceDetail.tsx` — moderator edit/delete controls on AI insight cards + small inline edit dialog.
- No new dependencies.
- Refusal patterns will live as a single regex array at the top of `ai-generate/index.ts` so they're easy to extend.
