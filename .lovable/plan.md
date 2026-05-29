# AI Bot Generators (Qwen / DeepSeek via OpenRouter)

Adds a fleet of "AI bot" users that produce structured answers/comments on questions and resources, triggered manually by admins from the Statistics page. Their output flows through the existing `answers` / comment systems so it can be bookmarked, upvoted, and downvoted like any user contribution.

## 1. Bot identities

Create real auth users (one per model), each with a profile:

| Email | Model | Display name |
|---|---|---|
| `qwen-bot@ai.local` | `qwen/qwen-2.5-72b-instruct:free` | Qwen Tutor |
| `deepseek-bot@ai.local` | `deepseek/deepseek-chat-v3.1:free` | DeepSeek Tutor |
| `vision-bot@ai.local` | `meta-llama/llama-3.2-11b-vision-instruct:free` | Vision Tutor |

Schema changes (migration):
- Extend `user_type` enum with `'ai_bot'`.
- Add `profiles.ai_model text` (OpenRouter model id) and `profiles.is_bot boolean default false`.
- Seed three `auth.users` + `profiles` rows with `user_type='ai_bot'`, `verified=true`, `teacher_verified=false`.

UI surfaces the existing `VerifiedBadge` plus a small "AI" tag (reuse `AIBadge.tsx`) next to bot names on answers/comments.

## 2. Generation types

A single new table `ai_generations` records each run so admins see status + can re-trigger:

```text
ai_generations
  id uuid pk
  target_type text   -- 'resource' | 'question'
  target_id   int
  kind        text   -- 'correction' | 'summary' | 'step_by_step' | 'infographic'
  bot_user_id uuid   -- which bot ran it
  status      text   -- 'queued' | 'running' | 'completed' | 'failed'
  output_answer_id int -- fk into answers when applicable
  error       text
  created_at, updated_at
```

`kind → bot` routing (deterministic, configurable later):
- `correction` → DeepSeek
- `summary` → Qwen
- `step_by_step` → Qwen
- `infographic` → Vision bot (HTML/SVG output)

## 3. Output storage

All four kinds are stored as **rows in `answers`** (questions) or as new comments on resources. Resources don't currently have a comments table — to keep the existing data shape, we'll treat resource generations the same way: insert into `answers` linked via a new nullable `answers.resource_id int` column. The detail view (`ResourceDetail.tsx`) already renders answer-like content for the resource; we'll surface AI outputs there with section labels ("Correction", "Résumé", "Étape par étape", "Infographie").

Each answer body uses a small JSON wrapper so the UI can pick a renderer:

```json
{ "ai_kind": "step_by_step", "language": "fr", "content": "...markdown..." }
```

Infographics store `{ "ai_kind": "infographic", "svg": "<svg>...</svg>" }`. Renderer sanitizes with DOMPurify before injecting.

Generated answers are inserted with `contributors=[bot_user_id]` and `verified=false` so users can vote them up/down through the existing votes table; admins can flip `verified=true`.

## 4. Trigger UI (Statistics)

New tab in `Statistics.tsx`: **"AI Generations"**.

- Per-row action menu on every resource and question row: `Generate correction / summary / step-by-step / infographic / Generate all`.
- Bulk action: checkbox column + top-bar button "Generate selected → [kind | all]".
- Each row shows the latest `ai_generations` status badges per kind (✓ done, ⏳ running, ✗ failed → retry).
- "Re-run" overwrites the previous answer row for that (target, kind, bot).

No automatic triggers — strictly admin-initiated, mirroring existing OCR pattern.

## 5. Backend pipeline

New edge function `ai-generate` (verify_jwt=false; validates admin role in code):

Input: `{ target_type, target_id, kinds: ['correction','summary',...] }`

Per kind:
1. Insert `ai_generations` row, status `running`.
2. Load target text:
   - `questions.ocr_text` + `questions.data` for questions.
   - `resources.ocr_text` + `resources.title` + `resources.description` for resources.
   - Detect language from text (simple heuristic: French default, Arabic if Arabic-range chars dominate).
3. Call OpenRouter chat completions with the matching free model + a kind-specific system prompt instructing it to reply in the source language.
4. For `infographic`, system prompt requires "return a single self-contained `<svg>` 600x800 with inline styles, no external assets, no scripts".
5. Insert/update an `answers` row authored by the bot user; set `ai_generations.output_answer_id` and `status='completed'`.
6. On 429/credit errors, mark `failed` with the error message.

Secrets: `OPENROUTER_API_KEY` (added via secrets tool).

No streaming — synchronous response per kind; the UI shows a row-level spinner and polls `ai_generations` every 3s while any are `running`.

## 6. Rendering

- `AnswerCard` (existing component) gains an "AI kind" header chip when `ai_kind` is present.
- Infographic answers render the sanitized SVG inside a bordered card with a "Download SVG" button.
- Step-by-step / summary / correction use the existing markdown renderer.
- Votes and bookmarks work without changes since they key off `content_type='answer'` + `content_id`.

## 7. RLS

- `ai_generations`: select for moderators/admins only; insert/update via service_role (edge function).
- `answers`: existing RLS already allows everyone to read non-deleted; bot inserts go through service_role with `contributors=[bot_user_id]`. Users can upvote/downvote unchanged. Only the bot user or admins can edit/delete (existing policy already covers this since `auth.uid() = ANY(contributors)` would be the bot — admins covered by `is_moderator_or_admin`).
- Add a new `answers.resource_id` nullable int + index; SELECT policy unchanged (still public if not deleted).

## 8. Out of scope (v1)

- No automatic background generation; admin-triggered only.
- No edit-and-resubmit loop — admins can delete + re-run.
- No streaming UI.
- No per-prompt customization; prompts are hard-coded server-side per kind/language.
- Tunisian curriculum nuance lives in the prompts, not in code.

## Files touched

New:
- `supabase/functions/ai-generate/index.ts`
- `src/components/statistics/AiGenerationsTab.tsx`
- `src/components/answers/AiAnswerRenderer.tsx` (markdown + SVG sanitizer)
- migration: `ai_generations` table, `answers.resource_id`, `profiles.ai_model/is_bot`, `user_type` enum value, seed bot users.

Edited:
- `src/pages/Statistics.tsx` (add tab + per-row actions)
- `src/pages/ResourceDetail.tsx` (render AI answers section)
- `src/pages/QuestionDetail.tsx` (label AI answers via `ai_kind` chip)
- `src/components/AnswerCard.tsx` or equivalent (chip + renderer dispatch)
- `supabase/config.toml` (add `[functions.ai-generate] verify_jwt = false`)

Secrets to add: `OPENROUTER_API_KEY`.
