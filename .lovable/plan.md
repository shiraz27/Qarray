## Diagnosis for resource 163

Looked it up:
- `resources.id=163` — title "Devoir de synthèse 3", 14 pages, OCR `completed`, readability `high`, OCR length **11,766 chars** (we currently truncate at 12,000, so the full text was sent to the models).
- Two AI rows on this resource:
  - `correction` (deepseek r1 free) → `completed` → the self-intro "Je suis un expert…" answer.
  - `summary` (qwen3-8b free) → `completed` → an answer that *solves* exercises instead of summarizing.
  - `infographic` (llama vision free) → `failed: 404 endpoints not found` (separate model availability bug).

So the OCR/page coverage isn't the bottleneck — the models received the full text. Three real problems:

1. **Weak free models give garbage.** `qwen3-8b:free` and `deepseek-r1:free` are small/free tiers; they wander off-task on real worksheets and confuse "summarize" with "solve".
2. **Refusal/self-intro detector misses these.** Current `looksLikeRefusal` only catches apology/token-limit phrasing. A self-promo answer ("Je suis un expert", "Mon rôle est", "N'hésitez pas à poser votre question", emoji-only sign-offs) sneaks through.
3. **Prompts are too soft.** The `summary` system prompt says "produce a structured résumé of the material" — but if the material *is* a worksheet of exercises, the model interprets that as "do them". The `correction` prompt doesn't require iterating every numbered exercise.

## Fix

### A. Stronger refusal/non-answer detection in `supabase/functions/ai-generate/index.ts`

Extend `REFUSAL_PATTERNS` with self-introduction / non-substantive openings:
- `je\s+suis\s+un?\s+(expert|assistant|tuteur|professeur)`
- `mon\s+(r[ôo]le|objectif)\s+est`
- `n['’]?h[ée]sitez\s+pas\s+(à|a)\s+(me\s+)?(poser|partager|demander)`
- `posez\s+(votre|une)\s+question`
- `i\s+am\s+an?\s+(expert|assistant|tutor|teacher)`
- `feel\s+free\s+to\s+ask`
- `how\s+can\s+i\s+help`

Add a second heuristic for the `correction` kind specifically:
- If the source text contains `Exercice\s+\d+` (≥2 occurrences) but the response mentions zero of those exact `Exercice N` headers → treat as refusal/off-task.

Both cases throw, which already routes through the existing `failed` path (no `answers` row inserted).

### B. Sharper system prompts (still in `ai-generate/index.ts`)

Rewrite the three text prompts to be explicit and prescriptive:

- **summary**: "You will receive teaching material that may include exercises. DO NOT solve the exercises. Produce a structured study summary of the *concepts, definitions, formulas, and methods* that appear in or are needed by the material. End with a 3–5 bullet 'à retenir'."
- **correction**: "You will receive one or more numbered exercises (`Exercice N`, often with sub-questions a/b/c). You MUST process every exercise in order, keep the original numbering, restate each question briefly, then give the full solution with justifications and the final answer in bold. Do not introduce yourself, do not invite further questions, do not skip exercises."
- **step_by_step**: Add "Do not introduce yourself. Start directly with Step 1."

### C. Default model upgrade (optional but recommended)

Today `KIND_TO_BOT` points `correction → deepseek-r1:free` and `summary/step_by_step → qwen3-8b:free`. Both are the weakest free tier on OpenRouter and the root cause of "ridiculous" output.

Recommended switch via Lovable AI Gateway (free during promo, much better quality):
- `correction` → `google/gemini-2.5-flash` (strong reasoning, handles long French math text)
- `summary` / `step_by_step` → `google/gemini-2.5-flash`
- Keep `infographic` on a vision model but swap the dead `meta-llama/llama-3.2-11b-vision-instruct:free` (currently 404s) → `google/gemini-2.5-flash-image` (Nano Banana) which the gateway supports.

To do this cleanly: add a small `callLovableAI(model, system, user)` path (POST to `https://ai.gateway.lovable.dev/v1/chat/completions` with the existing `LOVABLE_API_KEY`) and let `callModel` prefer Lovable AI Gateway when the bot's model id starts with `google/` or `openai/`, falling back to OpenRouter for `qwen/`, `deepseek/`, `meta-llama/`. Existing Ollama path stays as-is.

This needs the user's go-ahead because it changes the visible "bot" labels (the `BOTS` registry that controls the `model` field shown next to each AI answer).

### D. No DB or UI changes

Bad rows already in the DB (answer ids 27, 28) can be removed by the moderator using the Edit/Delete buttons added in the previous turn — no migration needed.

## Decision needed from you

1. **Switch default models to Lovable AI Gateway (Gemini 2.5 Flash) for correction/summary/step_by_step, and Nano Banana for infographic?** Strongly recommended — biggest quality jump. The visible bot name next to AI answers will change (e.g. `google/gemini-2.5-flash` instead of `qwen/qwen3-8b:free`).
2. **Or keep the same free OpenRouter models and only ship A + B (stricter refusal patterns + sharper prompts)?** Cheaper, no behavior change for the bot identities, but quality stays bounded by the small free models.

Tell me which (1 or 2 — or 1 only for certain kinds) and I'll implement.
