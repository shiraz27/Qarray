## Feature: Content Reporting / Flagging

Add a report button on **resources**, **questions**, and **answers** (comments) that lets any authenticated user flag content. Admins review reports in Statistics.

### 1. Database — new `content_reports` table

Columns:
- `id` uuid PK
- `content_type` text (`resource` | `question` | `answer`)
- `content_id` integer
- `reporter_id` uuid (auth.uid())
- `reason` text — enum-like: `inappropriate`, `quality`, `missing`, `incorrect`, `spam`, `other`
- `details` text (optional free-form, max 1000 chars)
- `status` text — `open` | `reviewed` | `dismissed` (default `open`)
- `reviewed_by` uuid, `reviewed_at` timestamptz, `admin_notes` text
- `created_at`, `updated_at`

RLS + GRANTs:
- authenticated can INSERT their own reports (reporter_id = auth.uid())
- reporter can SELECT their own reports
- admins/moderators can SELECT/UPDATE/DELETE all (via `is_moderator_or_admin`)
- unique partial index on `(content_type, content_id, reporter_id) WHERE status = 'open'` to prevent duplicate open reports from the same user

### 2. Reusable `ReportButton` component

`src/components/ReportButton.tsx`
- Props: `contentType`, `contentId`, optional `variant`/`size`
- Flag icon button (ghost, small) → opens AlertDialog confirmation: "Report something wrong to admins?"
- On confirm → second Dialog with:
  - RadioGroup of reasons (Inappropriate content, Low quality, Missing/broken, Incorrect info, Spam, Other)
  - Textarea for details (optional, max 1000, zod-validated)
  - Submit / Cancel
- Inserts into `content_reports`; toast on success; toast "Already reported" if unique violation

### 3. Integration points

- `ResourceDetail.tsx` — add button in the resource header actions
- Question card render block in `ResourceDetail.tsx` (and `QuestionDetail.tsx`) — add small flag button next to existing question actions
- Answer rendering — add flag button on each answer

Only show the button to authenticated users; hide for the content's own contributors (optional — can still report, but UX-wise hide self-report).

### 4. Admin UI — Statistics page new tab

New component `src/components/statistics/ReportsCard.tsx` added as a tab/section in `Statistics.tsx` (admin/moderator-gated like other admin cards):

- Filters: status (open/reviewed/dismissed/all), content_type, reason
- Table columns: created_at, reporter (full_name), content_type + linked id (opens `/resource/:id` or `/question/:id`), reason badge, details snippet, status
- Row expand → full details + admin notes textarea
- Actions per row: **Mark reviewed**, **Dismiss**, **Open content** (link). Optional **Delete content** (links to existing admin-delete flow, not duplicated here)
- Counts badge "X open reports" surfaced at top of Statistics for visibility

### Technical notes

- Use existing `is_moderator_or_admin(auth.uid())` helper for RLS
- Use shadcn `AlertDialog` + `Dialog` + `RadioGroup` + `Textarea` already in the project
- Validate input with zod (reason enum, details ≤ 1000 chars, trimmed)
- Log via `logAppEvent` (category `other`, event_type `content_reported`) for audit trail

### Out of scope (confirm if you want any of these)

- Email/push notification to admins when a report is filed
- Auto-hide content after N reports
- Per-reason auto-routing (e.g., quality → contributors instead of admins)
