## Goal

Add a global `notifications` feature flag, controllable from Moderation → Settings (same UI that already lists `memorizations`). When disabled, the notification bell + panel disappear from the header for all users.

## Changes

**1. DB migration** — seed a new row in `feature_flags`:
```sql
INSERT INTO public.feature_flags (id, enabled, description)
VALUES ('notifications', true, 'Show the notification bell and panel in the header')
ON CONFLICT (id) DO NOTHING;
```
No schema change — the Settings tab in Moderation already renders every row from `feature_flags` dynamically, so the new flag will appear there automatically with a working toggle.

**2. `src/components/Header.tsx`** — gate the bell:
- Read `const { enabled: notificationsEnabled } = useFeatureFlag('notifications')`.
- Skip the `fetchNotificationCount` effect + realtime subscription when `notificationsEnabled === false`.
- Don't render the bell button or the `<NotificationPanel>` when disabled.

That's it — same pattern `MemorizeButton.tsx` already uses for `memorizations`. No other call sites need changes (DB triggers keep writing rows; they're just not surfaced in the UI).

## Why this is minimal

- Existing `useFeatureFlag` hook works as-is.
- Existing Moderation → Settings tab auto-renders the new flag with a Switch + description — no UI code touched there.
- Disabling the flag does NOT stop the DB triggers that create notifications; if you later re-enable, history is preserved. (If you want triggers paused too, say so and I'll add a guard in the trigger functions.)
