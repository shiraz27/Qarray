## Problem

`capitalizeEveryWord` only uppercases the first letter of each word but leaves the rest of the letters untouched. So a stored string like `RÉSumÉ Maths Toute L'AnnÉE` stays mangled instead of becoming `Résumé Maths Toute L'Année`. This affects every place that uses the helper:

- Chapter page — chapter titles and resource titles (`src/pages/Chapter.tsx`)
- Resource detail page — resource title (`src/pages/ResourceDetail.tsx`)
- Question detail page (`src/pages/QuestionDetail.tsx`)
- MediaList text body (`src/components/MediaList.tsx`)

## Fix

Single change in `src/utils/textHelpers.ts`: lowercase the whole string first, then uppercase the first letter of every word. Since every call site already routes through this helper, this one edit generalizes the fix across the entire app.

```ts
export const capitalizeEveryWord = (s: string | null | undefined): string =>
  (s ?? '')
    .toString()
    .toLocaleLowerCase()
    .replace(/\b\p{L}/gu, (ch) => ch.toLocaleUpperCase());
```

The existing `\b\p{L}` Unicode word-boundary regex correctly handles accents and apostrophes (e.g. `L'Année`), so no other adjustments are needed.

No DB changes, no other files touched.