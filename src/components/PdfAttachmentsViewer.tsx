import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PdfInlinePreview } from './PdfInlinePreview';
import { fetchPdfViaProxy } from '@/utils/pdfMediaFetch';
import {
  fetchSplitPdfManifest,
  isSplitPdfManifestUrl,
} from '@/utils/splitPdfManifest';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PdfAttachmentsViewerProps {
  pdfs: { url: string }[];
  className?: string;
}

function getFilenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || 'document.pdf';
    const decoded = decodeURIComponent(last);
    if (/manifest(\.json|-json)$/i.test(decoded)) return 'document.pdf';
    if (/-pdf$/i.test(decoded)) return decoded.replace(/-pdf$/i, '.pdf');
    if (/\.pdf$/i.test(decoded)) return decoded;
    return decoded + '.pdf';
  } catch {
    return 'document.pdf';
  }
}

interface PdfMeta {
  loading: boolean;
  pages?: number;
  thumbDataUrl?: string;
  error?: boolean;
}

function usePdfMeta(url: string): PdfMeta {
  const [meta, setMeta] = useState<PdfMeta>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;

    (async () => {
      try {
        let firstPageUrl = url;
        let totalPages: number | undefined;

        if (isSplitPdfManifestUrl(url)) {
          const manifest = await fetchSplitPdfManifest(url);
          totalPages = manifest.totalPages || manifest.pages.length;
          if (manifest.pages.length > 0) {
            firstPageUrl = manifest.pages[0].url;
          } else {
            throw new Error('Empty manifest');
          }
        }

        const result = await fetchPdfViaProxy(firstPageUrl);
        if (result.kind !== 'ok') throw new Error('fetch failed');
        if (cancelled) return;

        const buf = await result.blob.arrayBuffer();
        if (cancelled) return;

        pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) return;

        if (totalPages === undefined) totalPages = pdfDoc.numPages;

        const page = await pdfDoc.getPage(1);
        if (cancelled) return;

        const targetWidth = 120;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no ctx');

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;

        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setMeta({ loading: false, pages: totalPages, thumbDataUrl: dataUrl });
      } catch {
        if (!cancelled) setMeta({ loading: false, error: true });
      }
    })();

    return () => {
      cancelled = true;
      try {
        pdfDoc?.destroy?.();
      } catch {
        /* noop */
      }
    };
  }, [url]);

  return meta;
}

function PdfThumbItem({
  url,
  index,
  active,
  onSelect,
}: {
  url: string;
  index: number;
  active: boolean;
  onSelect: () => void;
}) {
  const meta = usePdfMeta(url);
  const filename = useMemo(() => getFilenameFromUrl(url), [url]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors',
        active
          ? 'border-primary bg-accent'
          : 'border-border hover:bg-accent/50',
      )}
      aria-current={active ? 'true' : undefined}
    >
      <div className="relative flex h-16 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
        {meta.thumbDataUrl ? (
          <img
            src={meta.thumbDataUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : meta.loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm font-medium"
          title={filename}
        >
          {filename || `PDF ${index + 1}`}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {meta.loading
            ? 'Loading…'
            : meta.pages
              ? `${meta.pages} ${meta.pages === 1 ? 'page' : 'pages'}`
              : meta.error
                ? 'Preview unavailable'
                : ''}
        </div>
      </div>
    </button>
  );
}

function MobilePdfChip({
  url,
  index,
  active,
  onSelect,
}: {
  url: string;
  index: number;
  active: boolean;
  onSelect: () => void;
}) {
  const meta = usePdfMeta(url);
  const filename = useMemo(() => getFilenameFromUrl(url), [url]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-32 flex-shrink-0 flex-col items-stretch gap-1 rounded-md border p-2 text-left transition-colors',
        active
          ? 'border-primary bg-accent'
          : 'border-border hover:bg-accent/50',
      )}
      aria-current={active ? 'true' : undefined}
    >
      <div className="relative flex h-20 w-full items-center justify-center overflow-hidden rounded border bg-muted">
        {meta.thumbDataUrl ? (
          <img
            src={meta.thumbDataUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : meta.loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="truncate text-xs font-medium" title={filename}>
        {filename || `PDF ${index + 1}`}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {meta.loading
          ? '…'
          : meta.pages
            ? `${meta.pages}p`
            : ''}
      </div>
    </button>
  );
}

export function PdfAttachmentsViewer({
  pdfs,
  className,
}: PdfAttachmentsViewerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const safeIndex = Math.min(selectedIndex, pdfs.length - 1);
  const selectedUrl = pdfs[safeIndex]?.url;

  if (pdfs.length === 0) return null;

  if (pdfs.length === 1) {
    return (
      <div className={className}>
        <PdfInlinePreview url={pdfs[0].url} className="w-full" />
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Mobile: horizontal strip above preview */}
      <div className="md:hidden mb-3 -mx-1 overflow-x-auto">
        <div className="flex gap-2 px-1 pb-1">
          {pdfs.map((p, i) => (
            <MobilePdfChip
              key={p.url + i}
              url={p.url}
              index={i}
              active={i === safeIndex}
              onSelect={() => setSelectedIndex(i)}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        {/* Desktop: vertical sidebar */}
        <aside className="hidden md:flex md:w-60 lg:w-64 flex-shrink-0 flex-col gap-2 self-start sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1">
          {pdfs.map((p, i) => (
            <PdfThumbItem
              key={p.url + i}
              url={p.url}
              index={i}
              active={i === safeIndex}
              onSelect={() => setSelectedIndex(i)}
            />
          ))}
        </aside>

        <div className="min-w-0 flex-1">
          {selectedUrl && (
            <PdfInlinePreview
              key={selectedUrl}
              url={selectedUrl}
              className="w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}