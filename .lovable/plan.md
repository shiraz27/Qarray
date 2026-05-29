## Goal

1. Remember the last subject the user selected per class and restore it when they come back to the dashboard (or any time `SubjectTabs` mounts).
2. Warm chapter data for that subject as soon as the app loads so navigating into it feels instant.

## Changes

### 1. Persist last selected subject — `src/components/SubjectTabs.tsx`
- Add small helpers (top of file) that read/write `localStorage` under key `lastSubject:<classId>` with safe try/catch.
- In `useEffect([classId])` initial load:
  - After subjects load (cached or fresh), compute `preferredId = stored id if it exists in subjects, else first subject id`.
  - Use `preferredId` for `setActiveSubject` and `onSubjectChange`.
- In `handleSubjectClick`: persist the chosen id under the current class key.
- Keep current behavior when the stored id is no longer valid (subject deleted / class changed) — fall back to first.

### 2. Preload chapters of the persisted subject — `src/hooks/useDataPreload.ts` (or thin wrapper)
- Convert `useDataPreload` to also call `useLibraryData()` so it can warm the chapter cache.
- After resolving `profile.class_id`:
  - `await ensureSubjects(classId)` (already happens in `LibraryDataProvider` cache).
  - Read stored `lastSubject:<classId>` from localStorage; pick that subject if it's in the fetched list, otherwise the first subject.
  - Fire `ensureChapters(subjectId, classId)` in the background (no `await` on UI) so the Index page renders instantly when the user lands on it.
- Guard everything with try/catch (preload is best-effort).
- Keep the existing global `cache` object behavior intact for backward compatibility.

### 3. Minor cleanup
- The current `useDataPreload` does its own `subjects` fetch with a different filter than `LibraryDataProvider`. Replace it with `ensureSubjects(classId)` so both paths share one cache entry (avoids duplicate network calls).

## Out of scope
- No DB / RLS changes.
- No new global state library; just `localStorage` + existing `LibraryDataContext` caches.
- Don't touch other consumers of subject selection (forms, Move dialogs, etc.).
