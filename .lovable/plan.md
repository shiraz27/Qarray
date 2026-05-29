## Why the error happened

`PdfInlinePreview` shows "Invalid PDF structure" when `pdfjs` can't parse a per-page file in a split-PDF manifest (e.g. resources 163 and 164).

Root causes in today's pipeline (`src/utils/pdfSplitUpload.ts` → `upload-to-archive`):

1. **No post-upload verification.** Each `pages/N.pdf` is PUT to Archive.org and the URL is trusted. If the stored object is truncated or partially written (Archive.org has occasional partial writes and eventual consistency), the manifest still references it and pdfjs fails later.
2. **Original PDF is discarded after split.** Once a page is bad, there is no source of truth to re-derive it without the user re-uploading.
3. **No drift detection.** A page that becomes unreadable later (rare but possible) is only noticed when a user opens the preview.

## What to build

Two independent changes. Audit-only recovery for already-broken rows stays as-is — the existing `PdfHealthAuditPanel` is the recovery surface.

### 1. Verify-after-upload in `pdfSplitUpload.ts`

In `uploadPdfMaybeSplit`, after each `pages/N.pdf` upload resolves with a URL:

- Fetch the freshly-uploaded page back through the existing `fetch-media` edge function (same retry/backoff path used by `PdfInlinePreview`).
- Parse it with `pdfjsLib.getDocument(...).promise` and read `numPages` (must be `>= 1`).
- On failure, retry the whole page: re-upload the same page bytes (up to 2 retries with exponential backoff: 2s, 6s). If pdf-lib produced the page, fall through to the existing rasterize fallback (`rasterizePageToPdf`) for the final retry — rasterized pages always parse.
- If verification still fails after retries, abort the split with a clear error: throw before writing `manifest.json`. The caller surfaces it like any other upload error; no partial manifest gets stored in DB.

Add a small `verifyPageUploaded(url, bytes)` helper next to `splitPdfToPages`. Concurrency stays 1 (matches existing sequential upload loop).

Effects:
- No new corrupt manifests can enter the system.
- No DB schema change.
- Adds one extra GET per page; acceptable since splits already do N sequential PUTs.

### 2. Scheduled server-side re-audit

Today's `runPdfHealthAudit` (browser, on-demand) becomes the manual path. Add a parallel server path so regressions are caught without an admin clicking the button.

- New edge function `pdf-health-audit` (Deno):
  - Iterates `resources` and `questions` where `data` / payload contains `pages/manifest.json` (mirrors `src/utils/pdfHealthAudit.ts` selection).
  - For each manifest: fetch via Archive.org (no auth needed for reads), then HEAD + a minimal pdfjs parse per page using `pdfjs-dist` from npm (Deno-compatible) or a simpler PDF header/trailer sanity check (`%PDF-` start, `%%EOF` end, non-empty xref). The simpler check is enough to catch the truncated-upload class of corruption we've seen; full pdfjs parse can be a follow-up if the cheap check misses cases.
  - Concurrency: 4 pages / 2 rows in parallel; chunked across invocations using a `since_id` cursor so a single run stays under the function timeout.
- New table `pdf_health_reports` (admin-only RLS) with one row per audited manifest: `kind`, `content_id`, `manifest_url`, `total_pages`, `broken_pages int[]`, `unavailable_pages int[]`, `manifest_error text`, `checked_at`. Upsert on `(kind, content_id)`.
- Cron via `pg_cron` + `pg_net` (using the existing scheduling pattern), once daily off-peak, calls the edge function.
- `PdfHealthAuditPanel` gains a second tab/section "Latest scheduled report" that reads from `pdf_health_reports` so admins see the last run without re-running the browser scan.

### Non-goals

- No admin re-upload flow / auto re-split for broken rows (per user choice — audit-only recovery stays).
- No checksum/sha256 in manifest (deferred; verify-after-upload already covers the failure mode we've seen).
- No changes to `PdfInlinePreview` behavior beyond what's already shipped.

## Technical details

**Files to add**
- `supabase/functions/pdf-health-audit/index.ts` — server audit, paged by `?since_id=` cursor; CORS; JWT-verified admin-only (`has_role(user, 'admin')`).
- `src/components/statistics/PdfHealthScheduledReport.tsx` — table reading `pdf_health_reports` with CSV export.

**Files to edit**
- `src/utils/pdfSplitUpload.ts` — add `verifyPageUploaded` and a retry wrapper around the per-page upload loop; on final failure either rasterize-and-retry (pdf-lib path) or throw (rasterized path already failed).
- `src/components/statistics/PdfHealthAuditPanel.tsx` — mount the scheduled-report view alongside the existing on-demand button.

**DB migration**
- Create `public.pdf_health_reports` + GRANTs + RLS (admins read; service_role write).
- `cron.schedule('pdf-health-audit-daily', '0 3 * * *', ...)` calling the new function (inserted via the Supabase insert tool, not migration — contains the project URL + anon key).

**Verification helper sketch**

```ts
async function verifyPageUploaded(url: string): Promise<boolean> {
  try {
    const ab = await fetchPdfViaProxy(url); // existing helper
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
    const ok = pdf.numPages >= 1;
    try { await pdf.destroy(); } catch {}
    return ok;
  } catch { return false; }
}
```

## Outcome

- New splits: a corrupt page can no longer reach the DB — it either gets fixed by retry/rasterize or the whole upload fails loudly.
- Existing corpus: a daily server scan keeps `pdf_health_reports` fresh so admins always have a current list of broken manifests without manually scanning in-browser.
