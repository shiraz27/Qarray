
# Fix: Hide Memorizations Section When Feature is Disabled

## Problem
When the "memorizations" feature flag is disabled, the `MemorizationsList` component still renders and shows an empty state message: "No memorization sets yet for this subject". This is confusing because it implies content should exist but doesn't, when in reality the entire feature is turned off.

## Root Cause
- `MainContent.tsx` renders `MemorizationsList` unconditionally when chapters exist
- `MemorizationsList.tsx` does NOT check the `memorizations` feature flag
- Only `MemorizeButton.tsx` checks the flag, but it only controls the "Create" button, not the list

## Solution
Add the `useFeatureFlag` check to `MemorizationsList.tsx` and return `null` when the feature is disabled.

## File to Change

### `src/components/MemorizationsList.tsx`
1. Import `useFeatureFlag` hook
2. Call `useFeatureFlag('memorizations')` at the component level
3. Return `null` when `enabled === false` (feature disabled)
4. Optionally show a loading state while the flag is being fetched

```text
Changes:
- Add import: import { useFeatureFlag } from '@/hooks/useFeatureFlag';
- Add hook call: const { enabled: featureEnabled, loading: featureLoading } = useFeatureFlag('memorizations');
- Add early return: if (featureLoading || featureEnabled === false) return null;
```

## Technical Details

### Why Check Both Loading and Enabled
- While loading, we don't know if the feature is enabled, so we hide the section to prevent flash of content
- When `enabled === false`, the feature is explicitly disabled
- When `enabled === true`, we show the memorizations section normally

### Consistency with MemorizeButton
The `MemorizeButton` component already uses this pattern:
```tsx
if (loading || !enabled) return null;
```

We'll apply the same pattern to `MemorizationsList`.

## User Experience After Fix

| Feature State | What User Sees |
|---------------|----------------|
| Enabled, has memorizations | Full memorization list with cards |
| Enabled, no memorizations | Empty state: "No memorization sets yet" |
| Disabled | Nothing - section completely hidden |
| Loading | Nothing - section hidden until flag loads |
