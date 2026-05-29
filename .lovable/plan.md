## Goal

Make the "Shared with" badge on resources also account for the resource's own (source) chapter — so the class / subject / chapter counts and the destinations list reflect every place the resource lives, not only the explicitly shared chapters.

Visibility rule stays the same: the badge only renders when `shared_with` is non-empty (resources that live in just their source chapter still show no badge).

## Changes

### 1. `src/hooks/useSharedWithSummary.ts`
- Accept an optional `sourceChapterId: number | null | undefined` argument.
- Merge it into the `ids` set used for the `chapters` lookup (dedup, ignore null/NaN).
- Include the cache key derivation so changes to `sourceChapterId` re-run the effect.
- Returned `classes`, `subjects`, `chapters`, and `destinations` then naturally include the source chapter's class/subject/chapter entries.
- Optionally mark the source entry in `destinations` with `isSource: true` so the popover can label it.

### 2. `src/components/SharedWithBadge.tsx`
- Add `sourceChapterId?: number | null` prop.
- Pass it through to `useSharedWithSummary`.
- In the destinations list inside the popover, render a small "source" tag next to the entry whose `chapterId === sourceChapterId` so users can tell which one is the original chapter vs. a share.
- Keep the early-return when `sharedWith` is empty (unchanged behavior).

### 3. Call sites
- `src/pages/Chapter.tsx` (line ~1244): pass `sourceChapterId={(resource as any).chapter_id}`.
- `src/pages/ResourceDetail.tsx` (line ~621): pass `sourceChapterId={(resource as any).chapter_id}`.

## Out of scope

- No DB / RLS changes.
- No change to the badge visibility threshold.
- No change to `resourceChapterFilter` or query logic — this is display-only aggregation.
