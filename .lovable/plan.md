## Goal

Admin-facing health monitoring across upload pipeline, media delivery, AI, and edge/DB health. Read-only over existing logs/tables, plus one new table for things only the client can see. In-app dashboard + email digest (daily) + immediate alerts on critical thresholds.

## 1. Data layer

### New table `app_events` (client-only failures)

Captures what backend logs can't see: PDF/image preview failures, download failures, client-side upload retries/exhaustion, OCR client errors.

Columns: `id`, `created_at`, `severity` ('info'|'warn'|'error'|'critical'), `category` ('preview'|'download'|'upload'|'ocr'|'ai'|'other'), `event_type` (short slug), `message`, `url` (page where it happened), `target_url` (e.g. failing media), `content_type` ('resource'|'question'|null), `content_id` (int|null), `user_id` (nullable), `metadata` (jsonb).

RLS: admins read all; authenticated users INSERT own events only; no UPDATE/DELETE. Index on `(created_at desc)`, `(category, severity)`.

### No schema changes elsewhere

`ai_generations.error/status`, `pdf_health_reports`, `resources.ocr_status`, `questions.ocr_status` already exist and provide most signal.

## 2. Client instrumentation

Tiny helper `src/utils/appEvents.ts` exporting `logAppEvent({...})` that inserts to `app_events` with debouncing (max 1 event per signature per 30s, in-memory ring) to avoid spam.

Wired into:
- `PdfInlinePreview` / `MediaPreview` `onError` handlers → category `preview`.
- Download actions in `MediaList` / `ResourceDetail` / `QuestionDetail` failed `fetch` → category `download`.
- `pdfMediaFetch` / `fetch-media` proxy failures already surfaced to UI → log as `download`/`preview` when retries exhausted.
- `pdfSplitUpload` and `uploadFileToArchive` retry-exhausted/verify-failed paths → category `upload`, severity `error` or `critical`.
- Client OCR catastrophic failure (worker crash, OOM) → category `ocr`.

Successes are NOT logged (keeps table small; rates are derived from backend tables).

## 3. Aggregation edge function `health-snapshot`

`supabase/functions/health-snapshot/index.ts`. Admin-only (verify caller has `admin` role via service-role lookup). Returns a single JSON snapshot used by both the UI and the digest job.

Sources combined:
- **Upload/Archive.org**: supabase analytics `function_edge_logs` for `upload-to-archive` over last 24h — counts of 2xx/4xx/5xx, count of "503 SlowDown" event messages, p50/p95 latency. Plus `app_events` where category='upload'.
- **Media delivery**: edge logs for `fetch-media` (same metrics) + latest `pdf_health_reports` row counts (broken/unavailable pages totals). Plus `app_events` category in ('preview','download').
- **AI**: `ai_generations` grouped by `status` and `kind` over 24h/7d. Plus edge logs for `extract-metadata`, `ai-generate`.
- **Edge & DB**: `function_edge_logs` 5xx rate per function over 24h. `db_health` snapshot (connection saturation, deadlocks, WAL).
- **Quality KPIs**: SQL counts via `read_query`-style internal calls: % resources with `ocr_status='completed'`, % with `ocr_readability is null`, % with null `page_count`, orphan questions.

Returns:
```json
{
  "generated_at": "...",
  "windows": { "24h": {...}, "7d": {...} },
  "sections": {
    "upload": { "total": 412, "failed": 19, "slowdown_count": 41, "p95_ms": 2300, "critical": false },
    "media":  { "fetch_media_5xx_rate": 0.02, "pdf_pages_broken": 3, "client_preview_failures": 7, "critical": false },
    "ai":     { "by_kind": [...], "failed_24h": 5, "critical": false },
    "infra":  { "edge_5xx": [...], "db": {...}, "critical": false }
  },
  "alerts": [ { "id": "archive_slowdown", "severity": "critical", "message": "Archive.org rate-limited 41 times in last hour" } ]
}
```

Alert thresholds (configurable as constants at top of file):
- Critical: `upload-to-archive` 5xx rate > 30% over last hour, `fetch-media` 5xx rate > 20% over 1h, any function with > 100 5xx in 1h, db connection saturation > 90%.
- Warn: any 5xx rate > 10%, SlowDown count > 20/hr, AI failure rate > 25%, > 10 `app_events` of severity error/critical in 1h.

## 4. UI

### `src/pages/Statistics.tsx` → new "Monitoring" tab (admin-only)

Component `src/components/statistics/MonitoringPanel.tsx`. Sections (collapsible cards):
1. **Alerts** banner at top — red/yellow chips from `snapshot.alerts`.
2. **Upload pipeline** — sparkline of 24h success/fail, SlowDown counter, p95 latency, link to recent failed events table.
3. **Media delivery** — fetch-media error chart, broken-PDF-pages count (deep-link to existing `PdfHealthAuditPanel`), client preview failure feed.
4. **AI pipelines** — table per kind: queued/running/completed/failed counts + last error tooltip.
5. **Infra** — edge function 5xx leaderboard, db_health summary card.
6. **Quality KPIs** — % missing OCR / readability / page_count / source_link / description, with quick-filter buttons that jump to existing Statistics filters.
7. **Recent events** — paginated `app_events` feed with severity badges and filter chips by category.

Refresh button + auto-refresh every 60s while tab is open.

### Moderation page

Small banner at the top showing active critical alerts only (red chip with count and "Open monitoring →" link to Statistics → Monitoring). Pulls the same `health-snapshot` cached via React Query, 60s stale time.

### Header bell

Reuses existing notification UI: when `snapshot.alerts` contains anything with severity `critical`, show a red dot on the bell for admins. No DB notifications row needed — derived client-side from cached snapshot.

## 5. Email digest + immediate alerts

**Prerequisite**: email domain + infrastructure must be configured. If not yet set up, the plan stops here and asks the user to run the email setup dialog first; the digest job is deployed but inert until then.

### `supabase/functions/health-digest/index.ts`

Two modes via query/body param:
- `mode=digest` (default): pulls `health-snapshot`, renders HTML summary, enqueues one email per admin via `enqueue_email` (template name `health_digest`).
- `mode=alert&alert_id=...`: enqueues immediate email for a single critical alert; dedupes against last 6h via a small `health_alert_sent` table (id, alert_id, sent_at) to avoid spam.

### Cron jobs (added via `supabase--insert`, not migration)

- Daily digest at 08:00 Africa/Tunis → `health-digest?mode=digest`.
- Every 10 minutes → calls `health-digest?mode=check_critical`, which computes the snapshot, finds any critical alerts not yet sent in the last 6h, and fires `mode=alert` for each.

### Recipients

Query `user_roles` where `role='admin'`, join `profiles` for full_name, resolve emails via `auth.users` (service-role). Cap at 25 admins.

## 6. Out of scope

- No new metrics provider (Sentry, Logflare extension, etc.).
- No webhook alerts (Slack/Discord) — covered by email per user's choice.
- No success-event logging.
- No retention/cleanup job for `app_events` in v1 (rows are tiny; can revisit if it grows past ~100k).
- Auto-recovery actions (e.g. auto-rebuilding broken PDFs) — monitoring only.

## 7. Files

**New**
- `supabase/migrations/<ts>_app_events.sql`
- `src/utils/appEvents.ts`
- `supabase/functions/health-snapshot/index.ts`
- `supabase/functions/health-digest/index.ts`
- `src/components/statistics/MonitoringPanel.tsx`
- `src/components/statistics/MonitoringAlertsBanner.tsx` (used in Moderation header)

**Modified**
- `src/pages/Statistics.tsx` — add Monitoring tab
- `src/pages/Moderation.tsx` — render alerts banner
- `src/components/Header.tsx` — red dot on bell for admins when critical alerts
- `src/components/PdfInlinePreview.tsx`, `src/components/MediaPreview.tsx`, `src/components/MediaList.tsx`, `src/utils/pdfMediaFetch.ts`, `src/utils/pdfSplitUpload.ts`, `src/utils/clientOcrProcessor.ts`, `src/utils/clientQuestionOcrProcessor.ts` — call `logAppEvent` on failure paths

## 8. Validation

- Trigger a preview failure on a known-broken PDF → row appears in `app_events`, feed updates within 60s, "Recent events" badge increments.
- Force `upload-to-archive` to fail 5 times in a row → upload section turns yellow then red, alert email fires (deduped after the first).
- Daily digest preview by manually invoking `health-digest?mode=digest` → email lands in admin inbox with sectioned summary.
- DB health card shows real saturation values from `db_health`.
