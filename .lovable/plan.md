## Goal

In the "Common Chapters from other Bac classes" section, group results by **similarity to the native chapters** (not by class mapping order), and order all chapter lists by **id** instead of alphabetical name.

## Changes

### 1. `src/components/MainContent.tsx`

**A. Order native chapters by id**
- Line 86: change `.order('name')` → `.order('id', { ascending: true })`.

**B. Track which native chapter each common chapter maps to (to enable similarity grouping)**
- In the `chapter_common_mappings` fetch (line 152-155), also select `chapter_id` so we know the source native chapter for each mapping.
- Build a map: `commonChapterId -> nativeChapterId(s)` from the raw mappings.

**C. Extend `CommonChapter` type**
```ts
interface CommonChapter {
  id: number;
  name: string;
  className: string;
  matchedNativeId: number | null; // native chapter it's most similar to
}
```

**D. Group + order common chapters by similarity to native chapters**
- For each common chapter, attach its `matchedNativeId` (first native chapter id from the mapping list — these are AI-generated similarity mappings, so any mapped native is by definition similar).
- Sort the `commons` array such that:
  1. Common chapters that map to the **same native chapter cluster together**.
  2. Clusters are ordered following the native chapters' **id order** (matches the new chapter order).
  3. Within a cluster, sort by common chapter `id` ascending.
  4. Any common chapters with no `matchedNativeId` (shouldn't happen, but safety) go to the end, sorted by id.

**E. Add visual separators between similarity clusters**
- In the render block (lines 461-494), instead of a flat `.map`, iterate clusters:
  - For each cluster (group of commons sharing the same `matchedNativeId`), render the cards.
  - Between clusters, render a thin separator (e.g. a muted horizontal divider with the native chapter name as a small label, like `— Similar to: <Native Chapter Name> —`) so the user understands why items are grouped.
- The first cluster has no separator above it.

### 2. No DB / edge function changes
The existing `chapter_common_mappings` table already provides the `chapter_id` (native) → `common_chapter_id` link, which is exactly the similarity signal we need. No migration or AI call needed for this re-ordering.

## Technical notes

- Native chapter id order is already meaningful (chapters are inserted in curriculum order), so using id ordering matches the user's intent of "curriculum order, not alphabetical".
- A common chapter could match multiple native chapters; we cluster it under its lowest-id native match to keep ordering deterministic and avoid duplicates.
- Cluster header styling: small uppercase muted text + thin border, only between clusters (not before the first one).

## Out of scope
- Other lists (resources, questions, memorizations) — not mentioned by the user.
- Changing the AI matching logic itself.
