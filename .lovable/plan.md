New hypothesis: the previous fix failed because JavaScript `\b` word boundaries are ASCII-oriented, so accented letters like `é` are incorrectly treated as boundaries and get re-uppercased inside words.

Evidence gathered:
- The shared helper already lowercases first, so the code change was present.
- Testing the exact string showed the current regex matches multiple letters inside `résumé` and `année`, producing the unchanged bad result: `RÉSumÉ Maths Toute L'AnnÉE`.

Plan:
1. Replace the regex in `src/utils/textHelpers.ts` with a Unicode-aware word-start matcher that treats accented letters as letters.
2. Keep the helper centralized so the fix applies everywhere it is used: chapter page, resource detail page, question detail page, and media list.
3. Update the helper comment to reflect that it normalizes weird mixed casing, not just simple capitalization.
4. Verify with the exact failing title that the output becomes `Résumé Maths Toute L'Année`, including accented letters and apostrophes.

Technical detail:
- Use a pattern like `/(^|[^\p{L}])\p{L}/gu` instead of `\b\p{L}`.
- The replacement preserves any separator/punctuation and uppercases only the final letter in the matched segment, so `l'année` becomes `L'Année` and `RÉSumÉ` becomes `Résumé`.