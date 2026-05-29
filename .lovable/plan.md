## Goal
Make subject switching feel instant: no skeleton flash when chapters are already preloaded in cache.

## Change
Edit `src/components/MainContent.tsx` only.

1. Destructure `getChaptersFromCache` from `useLibraryData()` alongside `ensureChapters`.
2. In the effect that loads chapters on `subjectId` / `viewingClassId` change:
   - First call `getChaptersFromCache(subjectId, viewingClassId)`.
   - **Cache hit** → set `chapters`, `commonChapters`, `classId` synchronously and skip `setLoading(true)`. No skeleton renders.
   - **Cache miss** → keep existing behavior: `setLoading(true)` → `await ensureChapters(...)` → set state → `setLoading(false)`.
3. Initialize `chapters` / `commonChapters` state lazily from the cache for the initial `subjectId`, so the first paint after a subject click already has data when warm.
4. Leave `handleSuccess` (post-mutation refetch) untouched — it invalidates cache and should still show the brief skeleton.

## Out of scope
- `LibraryDataContext`, `useDataPreload`, `SubjectTabs`, DB, edge functions — unchanged.
- No silent background re-fetch on cache hit (cache stays source of truth until an explicit mutation invalidates it).

## Verification
- Load `/dashboard`, wait ~1s, click between subjects → chapters render instantly, zero skeleton flash, no new `chapters` requests in Network.
- Add/edit a chapter via manage dialog → skeleton appears briefly while refetching (expected).
