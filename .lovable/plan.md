

# Fix: PDF File Not Rendering on Resource Detail Page

## Problem
On `/resource/24`, the resource has 1 PDF file (`4sc_t1-pages-2-combined (2).pdf`) and shows "1 file(s)" count, but the actual clickable PDF card is not visible.

## Root Cause
The URL contains a **space** in the filename: `...4sc_t1-pages-2-combined (2).pdf`. 

In `ResourceDetail.tsx` line 620, the `resource.data` array (which already contains clean URLs) is joined into a text string with `\n`, then passed to `MediaList` which runs `extractMediaFromText()` to parse URLs back out using regex. This round-trip through text parsing is fragile — the space in the URL can cause the regex to split or mangle it, resulting in no valid media being detected.

Meanwhile, questions and answers store their data as a single text string with embedded URLs, so they genuinely need `extractMediaFromText`. But resources already have a clean `string[]` array — the text-parsing step is unnecessary and harmful.

## Solution
In `ResourceDetail.tsx`, replace the `MediaList` usage for `resource.data` with direct `MediaPreview` rendering from the array. This bypasses the text-parsing regex entirely.

## File Change

### `src/pages/ResourceDetail.tsx` (line ~620)
Replace:
```tsx
<MediaList data={resource.data.join('\n')} showText={true} />
```
With direct rendering of each URL:
```tsx
{resource.data.length > 0 && (
  <div className="space-y-3">
    <h3 className="text-sm font-semibold text-muted-foreground">
      Attachments ({resource.data.length})
    </h3>
    <div className="grid grid-cols-1 gap-4">
      {resource.data.map((url, index) => (
        <div key={index} className="w-full">
          <MediaPreview url={url} className="w-full" />
        </div>
      ))}
    </div>
  </div>
)}
```
Also add `MediaPreview` to the imports (it's already available since `MediaList` uses it).

This removes the "1 file(s)" duplicate count shown below the banner (line 633) since the attachment count is now shown inline. The existing `resource.data.length` display on line 633 can remain as-is for the summary area.

## Why This Works
- `resource.data` is already `["https://.../(2).pdf"]` — a clean URL array
- `MediaPreview` already handles spaces in URLs via `url.replace(/ /g, '%20')` on line 27
- No regex parsing needed, no chance of URL splitting

