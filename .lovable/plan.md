## Goal

Stop AI generations from failing at the current 60-second wall, and give the user feedback while they wait — a live elapsed counter plus an ETA based on past completions for the same kind, when we have data.

## Changes

### 1. Edge function `supabase/functions/ai-generate/index.ts`

- In `callOllama`, raise the `AbortController` timeout from `60_000` ms to `600_000` ms (10 minutes). Going truly "indefinite" is not possible — Supabase Edge Functions have a hard wall-clock limit (~150 s for synchronous responses, longer when a request stays in flight reading from upstream). 10 min is the practical ceiling and well above what local Ollama needs even for 20B models on long prompts.
- Add a small comment noting the platform constraint so the limit isn't mistaken for the old 60 s bug.

### 2. UI `src/components/statistics/AiGenerationsCard.tsx`

- Track `started_at` per running cell using `ai_generations.updated_at` (already bumped to "now" when status flips to `running` by the existing trigger). No schema change needed.
- For each kind, compute an **ETA** from the median duration of the most recent ~10 completed generations of that same `(target_type, kind)`. Query once on mount and after each completion:
  ```ts
  // returns rows: kind, duration_seconds
  select kind, extract(epoch from (updated_at - created_at)) as dur
    from ai_generations
   where target_type = $1 and status = 'completed'
   order by updated_at desc
   limit 80;
  ```
  Group client-side, take median per kind.
- Replace the current spinner in `StatusPill` (when `status === 'running'`) with:
  - `Loader2` spinner +
  - `{elapsed}s / ~{eta}s` when ETA exists, else `{elapsed}s`.
  - Tooltip: "Estimated from N past runs" or "No estimate yet — first run".
- A single `setInterval(..., 1000)` re-renders elapsed counters while anything is running (replaces the 3 s status poll's role for ticking; status polling stays at 3 s).
- Footer note: update the "Rate limits may cause failures" line to mention generations can take several minutes for long documents.

### 3. Docs `docs/AI_MODEL_HEALTH_CHECKS.md`

- Add a short "Timeouts & expected durations" section: 10-minute upstream timeout, typical durations observed (filled in by user later), how the ETA in the UI is derived.

## Out of scope

- Background / async job queue (would be needed for truly unbounded runs and is a much bigger change — happy to plan separately if you want it).
- Per-model ETA breakdown (we estimate by `kind`, which already maps 1:1 to a bot/model today).
