## Goal

In the Statistics → AI Generations card, let admins pick **which model(s)** to run for each AI action (Correction, Summary, Step-by-step, Infographic). Selecting multiple models runs them in parallel and creates **one separate bot answer per model**, so users can compare and vote.

Scope is limited to the Statistics admin panel. Inline AI buttons on Resource/Question pages keep their current single-model behavior.

## Model catalog

A curated, provider-tagged list bundled in `src/components/statistics/aiModels.ts` and re-exported to the edge function. Admin can pick any combination:

- **Lovable AI Gateway** (default, no extra key): `google/gemini-3-flash-preview`, `google/gemini-3.5-flash`, `google/gemini-2.5-pro`, `google/gemini-2.5-flash`, `google/gemini-2.5-flash-lite`, `google/gemini-2.5-flash-image` (image-only, used for infographic), `openai/gpt-5`, `openai/gpt-5-mini`, `openai/gpt-5-nano`
- **OpenRouter** (when `OPENROUTER_API_KEY` set): a small extra list e.g. `deepseek/deepseek-chat`, `qwen/qwen-2.5-72b-instruct`, `meta-llama/llama-3.3-70b-instruct`
- **Ollama** (when `OLLAMA_BASE_URL` set): `ollama:qwen2.5:7b`, `ollama:deepseek-r1:8b`, `ollama:gpt-oss:20b` (selectable only; client doesn't ping)

Each entry: `{ id, label, provider: 'lovable'|'openrouter'|'ollama', supportsKinds?: Kind[] }`. The picker greys out models that don't support the kind (e.g. only `google/gemini-2.5-flash-image` supports `infographic`; non-image models are hidden for that kind).

## DB migration

Goal: allow multiple generations per `(target,kind)` keyed by model.

- `ALTER TABLE ai_generations ADD COLUMN model text` (nullable for backfill; new rows always set it).
- `DROP INDEX uq_ai_generations_target_kind`.
- `CREATE UNIQUE INDEX uq_ai_generations_target_kind_model ON ai_generations (target_type, target_id, kind, COALESCE(model, ''))`.
- Backfill: `UPDATE ai_generations SET model = 'legacy' WHERE model IS NULL` so the unique index stays clean.
- Optionally add an index on `(model)` for filtering.

No new tables. No new policies. `answers` table unchanged — each generation still produces/updates one answer row, but now there's one answer per (target, kind, model) instead of one per (target, kind).

## Edge function `ai-generate` changes

- New request body shape (backwards compatible):
  ```
  { targets: [...], kinds: [...], models?: string[] }
  ```
  If `models` is omitted, fall back to the current `KIND_TO_BOT[kind]` model (preserves old callers).
- Loop becomes `for target × kind × model`. Each iteration runs `runGeneration(admin, target, kind, model)`:
  - Look up generation row by `(target_type, target_id, kind, model)` instead of `(target_type, target_id, kind)`.
  - Stale-running guard stays.
  - `ensureBot` is keyed by `model` string (one bot profile per model, e.g. display name "Gemini 2.5 Pro Tutor", email `bot+google-gemini-2-5-pro@ai.local`).
  - Routing in `callModel`:
    - `ollama:*` → `callOllama` with the suffix as model name.
    - `google/*`, `openai/*` → `callLovableAI` if `LOVABLE_API_KEY` present, else error.
    - Anything else → `callOpenRouter` if `OPENROUTER_API_KEY` present, else error.
  - For `infographic`, force-fallback to `google/gemini-2.5-flash-image` if a non-image model was selected (or skip + return a clear error per model).
- Existing per-bot answer upsert keeps working because each `(target,kind,model)` now has its own `ai_generations` row and therefore its own `output_answer_id`.

## Frontend: `AiGenerationsCard.tsx`

- Add **model multi-select** chips above the table (default selection: `google/gemini-3-flash-preview`). Persisted to `localStorage`. Grouped by provider, with a quick "Lovable only / OpenRouter / Ollama" filter.
- The bulk action menu and per-row Sparkles menu now send the selected `models` array along with `kinds`. Menu copy updates: "Generate correction with **N model(s)**".
- Status table per kind needs to show **per-model** status. Options chosen:
  - Keep one column per kind, but render a small stacked list inside the cell: one row per selected model with its `StatusPill` (spinner + ETA, ✓, or ✗ with tooltip).
  - Status fetch query becomes `select ..., model from ai_generations`, keyed by `${tab}:${id}:${kind}:${model}`.
  - ETA buckets become per-`kind:model` for accurate timing.
- Optimistic "running" marks one entry per selected model. Toast: "Triggered {kinds.length} action(s) × {models.length} model(s) on {ids.length} item(s)".

## Out of scope

- No model picker on Resource/Question inline AI buttons (keep current behavior).
- No automatic "pick best output" logic — users vote on competing answers via existing answer voting.
- No per-user model preferences. No cost display.

## Files to add / edit

- **migration** `supabase/migrations/<ts>_ai_generations_model.sql` — column + indexes + backfill.
- **add** `src/components/statistics/aiModels.ts` — model catalog (shared shape; edge function has its own copy since edge functions can't import from `src/`).
- **edit** `supabase/functions/ai-generate/index.ts` — add model catalog, change unique key lookups to include `model`, `ensureBot(model)`, route models to providers, accept `models[]` in request.
- **edit** `src/components/statistics/AiGenerationsCard.tsx` — model multi-select, per-model status rendering, request payload, ETA bucketing per model.

## Confirmation flow

After this plan is approved, I'll create the migration first (its own approval), then push the edge function + UI changes in one batch.
