## Problem

`useDataPreload` only warms chapters for the user's last-selected subject (or the first one). When you click any other subject, `MainContent` finds no cache entry, sets `loading=true`, and runs `ensureChapters` — which does N+1 count queries per chapter and is slow. That's the loading state you see.

## Fix

Extend the preloader so that, after the initial subject is warmed, it sequentially warms the remaining subjects in the background. By the time you click another tab, its chapters are already in the `LibraryDataContext` cache and `MainContent` renders synchronously (it already checks `getChaptersFromCache` before showing the skeleton).

## Changes

**`src/hooks/useDataPreload.ts`**
- After the existing `ensureChapters(preferred, classId)` call, kick off a background loop:
  - For each remaining subject (skip `preferred`), `await ensureChapters(subject.id, classId)` one-by-one.
  - Run inside an `IIFE`/`void` so it doesn't block the hook's main path.
  - Wrap each call in try/catch so one failure doesn't stop the rest.
  - Sequential (not `Promise.all`) to avoid hammering the DB given the existing N+1 query pattern.

**No other files change.** `LibraryDataContext.ensureChapters` already dedupes concurrent calls and `MainContent` already short-circuits on cache hits.

## Out of scope

- Refactoring the N+1 counts in `ensureChapters` (separate perf task).
- Invalidating preloaded chapters on mutation — existing `invalidateChapters` already handles that.
- Preloading across class changes (only the user's own `class_id` is warmed, same as today).
