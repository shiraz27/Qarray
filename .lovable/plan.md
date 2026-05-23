Plan:

1. Make the shared badge trigger reliable
- Replace the `Badge` component used inside `PopoverTrigger asChild` with a native `button` styled like the small badge.
- This removes the current React ref warning and avoids unreliable popover opening behavior.

2. Make mapped destinations visually obvious on click
- Put the full mapped list at the top of the popover as separate rows.
- Each row will show the full words and names:
  - `Class: Bac ...`
  - `Subject: ...`
  - `Chapter: ...`
- Remove truncation from these destination rows so chapters/classes/subjects are visible immediately, without relying on tooltip hover.

3. Keep the compact badge small
- Keep the closed badge compact, showing counts like `3 classes · 3 subjects · 5 chapters`.
- On click, the expanded popover will show the detailed mapped destinations clearly.

Technical details:
- Update only `src/components/SharedWithBadge.tsx` unless validation reveals the hook data is missing.
- Keep `useSharedWithSummary` as the source of mapped `destinations` since it already resolves `shared_with` chapter IDs into class, subject, and chapter names.
- Verify on `/resource/69` that clicking the badge displays all five mapped rows.