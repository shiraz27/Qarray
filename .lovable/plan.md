## What "smart matching" means here

Two layers, used together:

1. **Cheap normalization** (fast, runs on every keystroke): lowercase + strip diacritics (`é è ê à ô ç` → `e e e a o c`) + strip leading French articles (`l'`, `le `, `la `, `d'`) + collapse whitespace. Catches `électrolyse` ≡ `Electrolyse` ≡ `l'électrolyse`.

2. **AI semantic match** (slow, runs in batch or with debounce): a small Lovable AI call that judges whether two short labels mean the same thing — handles synonyms, abbreviations, sub-topics, and language variants that no string trick can catch (`Pile` ≡ `Pile Daniell`, `SVT` ≡ `Sciences de la Vie et de la Terre`, `Maths` ≡ `Mathématiques`, `Info` ≡ `Informatique`).

We apply (1) **everywhere** text is matched, and (2) **only where a human-feeling match really matters** (chapter equivalence, autocomplete suggestions, global search re-ranking).

---

## Areas affected (full sweep of the app)

I scanned every place in the codebase that compares user input to stored text. Here is the complete list:

| # | Location | Today | Needs (1) normalization | Needs (2) AI semantic |
|---|---|---|---|---|
| 1 | `GlobalSearch.tsx` — chapters / resources / questions / answers `.ilike` | Literal ILIKE | yes | yes — re-rank top results |
| 2 | OCR RPCs `search_pdf_content`, `search_question_content` | `LOWER LIKE LOWER` | yes | no (full text already broad) |
| 3 | `Statistics.tsx` admin filters (resources & questions) | `toLowerCase().includes` | yes | no |
| 4 | `MemorizationsModal.tsx` filter | `toLowerCase().includes` | yes | no |
| 5 | `SchoolAutocomplete.tsx` institute search + AI-suggested match | ILIKE + `===` | yes | yes — already has AI-suggested branch |
| 6 | `CompleteProfile.tsx` & `EditProfileDialog.tsx` institute pickers | client-side filter by state, no text search | yes (when user types) | no |
| 7 | Add/Edit Resource forms — teacher_name / school_name fields | free-text input only | yes — autocomplete suggestions for existing values | optional — AI dedupe of near-duplicates |
| 8 | `match-common-chapters` edge function (subjects + chapters) | weak prompts, raw names | yes (preprocess) | yes (already AI — strengthen) |
| 9 | `SubjectTabs.tsx` icon mapping by subject name | exact `iconMap[lower]` | yes (better icon hit-rate) | no |

---

## Implementation

### A. Shared helper

`src/utils/textHelpers.ts`:
```ts
export const normalizeText = (s: string) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')        // strip diacritics
    .replace(/^(l'|d'|le |la |les |un |une |des |de |du )/i, '')
    .replace(/['']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
```

Used directly in items 3, 4, 6, 9 and inside the autocomplete logic for items 5, 7.

### B. Database normalization

New migration:
- `CREATE EXTENSION IF NOT EXISTS unaccent;`
- Rewrite `search_pdf_content` and `search_question_content` so both sides are wrapped in `unaccent(lower(...))`.
- Add accent-insensitive RPCs that mirror today's `.ilike` calls and return the same columns:
  - `search_chapters_normalized`
  - `search_resources_normalized` (title/description/school_name/teacher_name)
  - `search_questions_normalized`
  - `search_answers_normalized`
  - `search_institutes_normalized`
  - `search_teachers_normalized` / `search_schools_normalized` — `SELECT DISTINCT teacher_name FROM resources WHERE unaccent(lower(teacher_name)) LIKE …` for items 7's autocompletes

### C. New shared edge function: `smart-match`

A single backend endpoint that powers item 1 re-ranking, item 5 AI branch, item 7 dedupe, and item 8.

```
POST /functions/v1/smart-match
body: { query: string, candidates: string[], topK?: number, context?: 'subject'|'chapter'|'school'|'teacher'|'generic' }
returns: { matches: { candidate: string, index: number, equivalent: boolean, reason?: string }[] }
```

- Uses `google/gemini-3-flash-preview` (default, fast & cheap).
- Tool-calling for structured output (no JSON parsing on free text).
- System prompt explicitly accepts: accents/case/articles, abbreviations (`Maths` ≡ `Mathématiques`), broader↔narrower (`Pile` ≡ `Pile Daniell`), language variants (`Sciences Physiques` ≡ `Physique`), reorderings, and minor typos.
- Always 200 with empty matches on rate-limit/credit errors so the UI gracefully falls back to literal results (toast on 429/402).

### D. Frontend wiring per area

**1. GlobalSearch.tsx**
- Swap each `.ilike(...)` block for the matching `search_*_normalized` RPC.
- After base results arrive, if `query.length >= 3`, send the query plus the top 30 result titles to `smart-match`. Promote AI-confirmed equivalents to the top of each section with a tiny "smart match" badge. Debounce 400 ms.

**2. OCR RPCs** — done by migration in B.

**3. Statistics.tsx admin filters** — replace `toLowerCase().includes` with `normalizeText(x).includes(normalizeText(q))`.

**4. MemorizationsModal.tsx** — same.

**5. SchoolAutocomplete.tsx** — replace ILIKE with `search_institutes_normalized`; reuse `smart-match` for the existing AI-suggested branch (drop the bespoke logic).

**6. CompleteProfile / EditProfileDialog institute pickers** — when user types, filter the in-memory list with `normalizeText`.

**7. AddResource / EditResource forms** — add lightweight teacher/school autocomplete pulling distinct values via `search_teachers_normalized` / `search_schools_normalized`, then sending the typed value + suggestions to `smart-match` to surface a "Did you mean X?" chip when an equivalent already exists. Prevents `Mr. Ben Salah` and `Ben Salah, Mr` becoming two records.

**8. match-common-chapters edge function** — rewrite to:
- Pre-normalize all subject and chapter names with the same JS helper before sending to the model.
- Send both `name` and `normalized` in the payload.
- Replace the chapter-matching system prompt with explicit, example-driven guidance covering accents, articles, case, broader↔narrower, abbreviations, and synonyms (with a few concrete equivalence examples and counter-examples).
- Same softening for the subject-clustering prompt.
- Admin re-runs **Run AI Match** in Statistics afterward.

**9. SubjectTabs.tsx** — apply `normalizeText` before keying into `iconMap`.

---

## Files to change

- New migration: enable `unaccent`, rewrite the 2 OCR RPCs, add 7 new `search_*_normalized` RPCs.
- New: `supabase/functions/smart-match/index.ts`.
- Edited: `src/utils/textHelpers.ts`, `src/components/GlobalSearch.tsx`, `src/components/SchoolAutocomplete.tsx`, `src/components/SubjectTabs.tsx`, `src/components/MemorizationsModal.tsx`, `src/pages/Statistics.tsx`, `src/pages/CompleteProfile.tsx`, `src/components/EditProfileDialog.tsx`, `src/components/AddResourceForm.tsx`, `src/components/AddResourceGlobalForm.tsx`, `src/components/AddResourceFormWithSelection.tsx`, `src/components/EditResourceForm.tsx`, `supabase/functions/match-common-chapters/index.ts`.

---

## Cost & UX safeguards

- AI re-ranking only fires for queries ≥ 3 chars and ≤ 30 candidates per call.
- 400 ms debounce on `smart-match` calls in search/autocomplete.
- Literal results render immediately; AI badges appear when the call resolves.
- 429 / 402 errors caught in `smart-match`, surfaced as a one-time toast, then the feature silently degrades to literal matching.

---

## Out of scope

- Trigram fuzzy search (`pg_trgm`) — normalization + AI covers the reported cases.
- Auto re-running the chapter AI match — admin keeps the existing **Run AI Match** button.
