import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, ExternalLink, ZoomIn, ZoomOut, AlertCircle, RefreshCw, Files } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchPdfViaProxy, triggerBlobDownload } from '@/utils/pdfMediaFetch';
import {
  isSplitPdfManifestUrl,
  fetchSplitPdfManifest,
  type SplitPdfManifest,
} from '@/utils/splitPdfManifest';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PdfInlinePreviewProps {
  url: string;
  className?: string;
}

function getFilenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || 'document.pdf';
    // Reverse our dash-extension convention: trailing "-pdf" → ".pdf"
    const decoded = decodeURIComponent(last);
    if (/-pdf$/i.test(decoded)) return decoded.replace(/-pdf$/i, '.pdf');
    if (/\.pdf$/i.test(decoded)) return decoded;
    return decoded + '.pdf';
  } catch {
    return 'document.pdf';
  }
}

function PdfPage({ page, scale }: { page: any; scale: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);

  const viewport = page.getViewport({ scale });

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setVisible(true);
        }
      },
      { rootMargin: '400px 0px' }
    );
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    let cancelled = false;
    let task: any;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const vp = page.getViewport({ scale: scale * dpr });
    canvasRef.current.width = vp.width;
    canvasRef.current.height = vp.height;
    canvasRef.current.style.width = `${viewport.width}px`;
    canvasRef.current.style.height = `${viewport.height}px`;
    task = page.render({ canvasContext: ctx, viewport: vp });
    task.promise.then(() => { if (!cancelled) setRendered(true); }).catch(() => {});
    return () => {
      cancelled = true;
      try { task?.cancel?.(); } catch {}
    };
  }, [visible, scale, page, viewport.width, viewport.height]);

  return (
    <div
      ref={containerRef}
      className="relative bg-white shadow-sm border border-border rounded-md overflow-hidden mx-auto"
      style={{ width: viewport.width, height: viewport.height }}
    >
      <canvas ref={canvasRef} className="block" />
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function SinglePdfView({
  url,
  className = '',
  filenameOverride,
  rightSlot,
  pageBadge,
}: {
  url: string;
  className?: string;
  filenameOverride?: string;
  rightSlot?: React.ReactNode;
  pageBadge?: string;
}) {
  const [pages, setPages] = useState<any[]>([]);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const blobRef = useRef<Blob | null>(null);
  const pdfDocRef = useRef<any>(null);
  const filename = filenameOverride || getFilenameFromUrl(url);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    setDownloadReady(false);
    try {
      const result = await fetchPdfViaProxy(url);
      if (result.kind === 'unavailable') {
        setUnavailable(true);
        setLoading(false);
        return;
      }
      if (result.kind === 'error') {
        throw new Error(result.message);
      }

      // Save the blob immediately so Download works even if rendering fails.
      blobRef.current = result.blob;
      setDownloadReady(true);

      const arrayBuffer = await result.blob.arrayBuffer();
      // pdfjs may detach the buffer, so pass a copy.
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
      pdfDocRef.current = pdf;
      const pgs: any[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        pgs.push(await pdf.getPage(i));
      }
      setPages(pgs);
    } catch (e) {
      console.error('PDF load error:', e);
      setError(e instanceof Error ? e.message : 'Failed to load PDF');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
    return () => {
      blobRef.current = null;
      try { pdfDocRef.current?.destroy?.(); } catch {}
      pdfDocRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const handleDownload = async () => {
    if (downloading) return;
    if (blobRef.current) {
      triggerBlobDownload(blobRef.current, filename);
      return;
    }
    // Preview never loaded — try to fetch now just for the download.
    setDownloading(true);
    try {
      const result = await fetchPdfViaProxy(url);
      if (result.kind === 'ok') {
        blobRef.current = result.blob;
        setDownloadReady(true);
        triggerBlobDownload(result.blob, filename);
      } else {
        setError(result.kind === 'unavailable'
          ? 'File still processing — try again in a moment.'
          : result.message);
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-card/95 backdrop-blur border-b border-border px-3 py-2">
        <span className="text-sm font-medium truncate flex-1 min-w-0">{filename}</span>
        <span className="text-xs text-muted-foreground">
          {pageBadge ?? (pages.length > 0 ? `${pages.length} page${pages.length > 1 ? 's' : ''}` : '')}
        </span>
        {rightSlot}
        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(2)))}
            disabled={loading || !!error || unavailable}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs w-10 text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(2)))}
            disabled={loading || !!error || unavailable}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleDownload}
            disabled={downloading}
            className="gap-1"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Download</span>
          </Button>
          <Button variant="ghost" size="sm" asChild className="gap-1">
            <a
              href={url.replace(/ /g, '%20')}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">Open original</span>
            </a>
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p className="leading-snug">
          The "Open original" link goes directly to Archive.org and may be blocked by Chrome or an ad blocker.
          If preview or Open fails, use the <strong>Download</strong> button — it always works through our server.
        </p>
      </div>

      <div className="bg-muted/30 p-3 max-h-[80vh] overflow-auto">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading PDF…</p>
          </div>
        )}

        {unavailable && !loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">File still processing</p>
              <p className="text-xs text-muted-foreground">
                The file may still be uploading. Please try again in a moment.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={load} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        )}

        {error && !loading && !unavailable && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-sm font-medium">Couldn't load preview</p>
              <p className="text-xs text-muted-foreground">{error}</p>
              {downloadReady && (
                <p className="text-xs text-muted-foreground mt-1">
                  You can still download the file using the Download button above.
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={load} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && !unavailable && pages.length > 0 && (
          <div className="flex flex-col gap-3">
            {pages.map((page, i) => (
              <PdfPage key={i} page={page} scale={scale} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export function PdfInlinePreview({ url, className = '' }: PdfInlinePreviewProps) {
  if (isSplitPdfManifestUrl(url)) {
    return <SplitPdfPreview url={url} className={className} />;
  }
  return <SinglePdfView url={url} className={className} />;
}

/**
 * Wrapper for split-PDF manifest URLs. Loads the manifest, exposes a page
 * dropdown, and reuses SinglePdfView to render the selected page.
 */
function SplitPdfPreview({ url, className = '' }: PdfInlinePreviewProps) {
  const [manifest, setManifest] = useState<SplitPdfManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(1);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const m = await fetchSplitPdfManifest(url);
      setManifest(m);
      setSelected(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load manifest');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownloadAll = async () => {
    if (!manifest || downloadingAll) return;
    setDownloadingAll(true);
    try {
      const merged = await PDFDocument.create();
      for (const page of manifest.pages) {
        const result = await fetchPdfViaProxy(page.url);
        if (result.kind !== 'ok') {
          throw new Error(
            result.kind === 'unavailable'
              ? `Page ${page.n} not available yet`
              : result.message,
          );
        }
        const ab = await result.blob.arrayBuffer();
        const src = await PDFDocument.load(ab, { ignoreEncryption: true });
        const indices = src.getPageIndices();
        const copied = await merged.copyPages(src, indices);
        copied.forEach((p) => merged.addPage(p));
      }
      const bytes = await merged.save();
      const buf = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      triggerBlobDownload(
        new Blob([buf], { type: 'application/pdf' }),
        manifest.originalName || 'document.pdf',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download all failed');
    } finally {
      setDownloadingAll(false);
    }
  };

  if (loading) {
    return (
      <Card className={`overflow-hidden ${className}`}>
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading multi-page PDF…
        </div>
      </Card>
    );
  }

  if (error || !manifest) {
    return (
      <Card className={`overflow-hidden ${className}`}>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm font-medium">Couldn't load multi-page PDF</p>
          {error && <p className="text-xs text-muted-foreground">{error}</p>}
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  const currentPage =
    manifest.pages.find((p) => p.n === selected) || manifest.pages[0];

  const dropdown = (
    <div className="flex items-center gap-2">
      <Select
        value={String(selected)}
        onValueChange={(v) => setSelected(parseInt(v, 10))}
      >
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {manifest.pages.map((p) => (
            <SelectItem key={p.n} value={String(p.n)} className="text-xs">
              Page {p.n} / {manifest.totalPages}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownloadAll}
        disabled={downloadingAll}
        className="gap-1"
      >
        {downloadingAll ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Files className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">Download all</span>
      </Button>
    </div>
  );

  return (
    <SinglePdfView
      key={currentPage.url}
      url={currentPage.url}
      className={className}
      filenameOverride={`${manifest.originalName} — page ${currentPage.n}`}
      pageBadge={`${manifest.totalPages} pages`}
      rightSlot={dropdown}
    />
  );
}

export default PdfInlinePreview;