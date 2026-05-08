# Fix: Global search "All Classes" not actually searching all classes

## Root cause

`src/components/GlobalSearch.tsx` lines 76–78:

```ts
const effectiveClassId = selectedClassId && selectedClassId !== 'all'
  ? parseInt(selectedClassId)
  : (publicMode ? null : userClassId);
```

When the user explicitly picks **"All Classes"** (`selectedClassId === 'all'`), in private mode (dashboard) it falls into the `else` branch and uses **`userClassId`** — silently scoping every search back to the user's own class. That's why "Correction Manuel Scolaire" only returned results for "Bac sciences expérimentales" (the logged-in user's class) and nothing for Bac maths / techniques / informatique etc., even though those resources exist (verified in DB: 30+ matching rows across multiple classes).

The "All Classes" choice is essentially a no-op on the dashboard today.

Side effect of the same bug: `fetchSubjects` is keyed on `effectiveClassId`, so the subject dropdown also stays restricted to the user's class when "All Classes" is picked.

## Fix

Treat `selectedClassId === 'all'` as an explicit opt-out in **both** public and private mode. Only fall back to `userClassId` when `selectedClassId` is still empty (initial mount before `fetchUserClass` pre-selects it).

```ts
const effectiveClassId =
  selectedClassId === 'all'
    ? null                                  // explicit "All Classes" → search everywhere
    : selectedClassId
      ? parseInt(selectedClassId)           // explicit class id
      : (publicMode ? null : userClassId);  // not yet initialized → user's class in private mode
```

No other changes needed:
- `search_resources_normalized` / `search_questions_normalized` / `search_chapters_normalized` / `search_answers_normalized` already accept `NULL` for `p_class_id` and return matches across all classes (verified by direct RPC call returning 10/10 results).
- OCR sub-searches (`search_pdf_content`, `search_question_content`) are already gated behind `effectiveClassId &&`, so they'll be skipped when "All Classes" is chosen — that's the existing intended behavior; we keep it.
- Subject dropdown will correctly populate with all classes' subjects once `effectiveClassId` is `null`.

## Files

- `src/components/GlobalSearch.tsx` — single 3-line change to the `effectiveClassId` derivation.

## Out of scope

- No DB / RPC changes.
- No change to OCR-content search gating.
- No change to public landing page search behavior (already worked correctly because `publicMode` branch uses `null`).
