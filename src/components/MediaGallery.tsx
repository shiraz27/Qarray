import { useEffect, useMemo, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { FileText, Loader2, Image as ImageIcon, Film, Music, File as FileIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PdfInlinePreview } from './PdfInlinePreview';
import { MediaPreview } from './MediaPreview';
import { fetchPdfViaProxy } from '@/utils/pdfMediaFetch';
import {
  fetchSplitPdfManifest,
  isSplitPdfManifestUrl,
} from '@/utils/splitPdfManifest';
import { detectMediaType, isPdfUrl, type MediaType } from '@/utils/mediaTypeUtils';
import { mediaSrc, isMediaToken, tokenInnerPath } from '@/utils/mediaToken';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface MediaGalleryProps {
  items: { url: string; type?: MediaType }[];
  className?: string;
}

function getFilenameFromUrl(url: string): string {
  try {
    const target = isMediaToken(url) ? tokenInnerPath(url) : url;
    const u = new URL(target, 'http://x');
    const last = u.pathname.split('/').filter(Boolean).pop() || 'file';
    const decoded = decodeURIComponent(last);
    if (/manifest(\.json|-json)$/i.test(decoded)) return 'document.pdf';
    if (/-pdf$/i.test(decoded)) return decoded.replace(/-pdf$/i, '.pdf');
    if (/-(jpg|jpeg|png|gif|webp)$/i.test(decoded)) {
      return decoded.replace(/-(jpg|jpeg|png|gif|webp)$/i, '.$1');
    }
    if (/-(mp3|wav|ogg|m4a|mp4|webm|mov)$/i.test(decoded)) {
      return decoded.replace(/-(mp3|wav|ogg|m4a|mp4|webm|mov)$/i, '.$1');
    }
    return decoded;
  } catch {
    return 'file';
  }
}

interface PdfMeta {
  loading: boolean;
  pages?: number;
  thumbDataUrl?: string;
  error?: boolean;
}

function usePdfMeta(url: string, enabled: boolean): PdfMeta {
  const [meta, setMeta] = useState<PdfMeta>({ loading: enabled });

  useEffect(() => {
    if (!enabled) {
      setMeta({ loading: false });
      return;
    }
    let cancelled = false;
    let pdfDoc: any = null;

    (async () => {
      try {
        let firstPageUrl = url;
        let totalPages: number | undefined;

        if (isSplitPdfManifestUrl(url)) {
          const manifest = await fetchSplitPdfManifest(url);
          totalPages = manifest.totalPages || manifest.pages.length;
          if (manifest.pages.length > 0) firstPageUrl = manifest.pages[0].url;
          else throw new Error('Empty manifest');
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
  }, [url, enabled]);

  return meta;
}

function TypeIcon({ type, className }: { type: MediaType; className?: string }) {
  switch (type) {
    case 'pdf':
      return <FileText className={className} />;
    case 'image':
      return <ImageIcon className={className} />;
    case 'video':
      return <Film className={className} />;
    case 'audio':
      return <Music className={className} />;
    default:
      return <FileIcon className={className} />;
  }
}

function ThumbContent({ url, type }: { url: string; type: MediaType }) {
  const pdfMeta = usePdfMeta(url, type === 'pdf');

  if (type === 'pdf') {
    if (pdfMeta.thumbDataUrl) {
      return <img src={pdfMeta.thumbDataUrl} alt="" className="h-full w-full object-cover" loading="lazy" />;
    }
    if (pdfMeta.loading) {
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    }
    return <FileText className="h-5 w-5 text-muted-foreground" />;
  }

  if (type === 'image') {
    return <img src={mediaSrc(url)} alt="" className="h-full w-full object-cover" loading="lazy" />;
  }

  if (type === 'video') return <Film className="h-5 w-5 text-muted-foreground" />;
  if (type === 'audio') return <Music className="h-5 w-5 text-muted-foreground" />;
  return <FileIcon className="h-5 w-5 text-muted-foreground" />;
}

function typeLabel(type: MediaType, pages?: number): string {
  switch (type) {
    case 'pdf':
      return pages ? `${pages} ${pages === 1 ? 'page' : 'pages'}` : 'PDF';
    case 'image':
      return 'Image';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Audio';
    default:
      return 'File';
  }
}

function DesktopThumb({
  url, type, index, active, onSelect,
}: { url: string; type: MediaType; index: number; active: boolean; onSelect: () => void }) {
  const filename = useMemo(() => getFilenameFromUrl(url), [url]);
  const pdfMeta = usePdfMeta(url, type === 'pdf');
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors',
        active ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50',
      )}
      aria-current={active ? 'true' : undefined}
    >
      <div className="relative flex h-16 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
        <ThumbContent url={url} type={type} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={filename}>
          {filename || `File ${index + 1}`}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <TypeIcon type={type} className="h-3 w-3" />
          <span>{typeLabel(type, pdfMeta.pages)}</span>
        </div>
      </div>
    </button>
  );
}

function MobileChip({
  url, type, index, active, onSelect,
}: { url: string; type: MediaType; index: number; active: boolean; onSelect: () => void }) {
  const filename = useMemo(() => getFilenameFromUrl(url), [url]);
  const pdfMeta = usePdfMeta(url, type === 'pdf');
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-32 flex-shrink-0 flex-col items-stretch gap-1 rounded-md border p-2 text-left transition-colors',
        active ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50',
      )}
      aria-current={active ? 'true' : undefined}
    >
      <div className="relative flex h-20 w-full items-center justify-center overflow-hidden rounded border bg-muted">
        <ThumbContent url={url} type={type} />
      </div>
      <div className="truncate text-xs font-medium" title={filename}>
        {filename || `File ${index + 1}`}
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <TypeIcon type={type} className="h-2.5 w-2.5" />
        <span>{typeLabel(type, pdfMeta.pages)}</span>
      </div>
    </button>
  );
}

export function MediaGallery({ items, className }: MediaGalleryProps) {
  const enriched = useMemo(
    () =>
      items.map((it) => ({
        url: it.url,
        type: (it.type ?? detectMediaType(it.url)) as MediaType,
      })),
    [items],
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const safeIndex = Math.min(selectedIndex, enriched.length - 1);
  const selected = enriched[safeIndex];

  if (enriched.length === 0) return null;

  if (enriched.length === 1) {
    const only = enriched[0];
    return (
      <div className={className}>
        {only.type === 'pdf' || isPdfUrl(only.url) ? (
          <PdfInlinePreview url={only.url} className="w-full" />
        ) : (
          <MediaPreview url={only.url} className="w-full" />
        )}
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="md:hidden mb-3 -mx-1 overflow-x-auto">
        <div className="flex gap-2 px-1 pb-1">
          {enriched.map((it, i) => (
            <MobileChip
              key={it.url + i}
              url={it.url}
              type={it.type}
              index={i}
              active={i === safeIndex}
              onSelect={() => setSelectedIndex(i)}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <aside className="hidden md:flex md:w-60 lg:w-64 flex-shrink-0 flex-col gap-2 self-start sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1">
          {enriched.map((it, i) => (
            <DesktopThumb
              key={it.url + i}
              url={it.url}
              type={it.type}
              index={i}
              active={i === safeIndex}
              onSelect={() => setSelectedIndex(i)}
            />
          ))}
        </aside>

        <div className="min-w-0 flex-1">
          {selected &&
            (selected.type === 'pdf' || isPdfUrl(selected.url) ? (
              <PdfInlinePreview key={selected.url} url={selected.url} className="w-full" />
            ) : (
              <MediaPreview key={selected.url} url={selected.url} className="w-full" />
            ))}
        </div>
      </div>
    </div>
  );
}