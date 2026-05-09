import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, ExternalLink, ZoomIn, ZoomOut, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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

export function PdfInlinePreview({ url, className = '' }: PdfInlinePreviewProps) {
  const [pages, setPages] = useState<any[]>([]);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const pdfDocRef = useRef<any>(null);
  const filename = getFilenameFromUrl(url);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('fetch-media', {
        body: { url },
      });
      if (invokeError) throw invokeError;

      let arrayBuffer: ArrayBuffer;
      if (data instanceof Blob) {
        // Detect JSON-coded "unavailable" body (status 200, JSON content)
        if (data.type.includes('application/json')) {
          const text = await data.text();
          try {
            const parsed = JSON.parse(text);
            if (parsed?.unavailable) {
              setUnavailable(true);
              setLoading(false);
              return;
            }
            throw new Error(parsed?.error || 'Failed to load PDF');
          } catch (e) {
            throw e instanceof Error ? e : new Error('Invalid response');
          }
        }
        arrayBuffer = await data.arrayBuffer();
      } else if (data instanceof ArrayBuffer) {
        arrayBuffer = data;
      } else if (data && typeof data === 'object' && 'unavailable' in (data as any)) {
        setUnavailable(true);
        setLoading(false);
        return;
      } else {
        throw new Error('Unexpected response from media proxy');
      }

      // Keep a copy for download (pdfjs may transfer/detach the buffer)
      const downloadCopy = arrayBuffer.slice(0);
      const blob = new Blob([downloadCopy], { type: 'application/pdf' });
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = URL.createObjectURL(blob);

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
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
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
      try { pdfDocRef.current?.destroy?.(); } catch {}
      pdfDocRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const handleDownload = () => {
    if (!blobUrlRef.current) return;
    const a = document.createElement('a');
    a.href = blobUrlRef.current;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-card/95 backdrop-blur border-b border-border px-3 py-2">
        <span className="text-sm font-medium truncate flex-1 min-w-0">{filename}</span>
        <span className="text-xs text-muted-foreground">
          {pages.length > 0 ? `${pages.length} page${pages.length > 1 ? 's' : ''}` : ''}
        </span>
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
            disabled={!blobUrlRef.current}
            className="gap-1"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download</span>
          </Button>
          <Button variant="ghost" size="sm" asChild className="gap-1">
            <a href={url.replace(/ /g, '%20')} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">Open</span>
            </a>
          </Button>
        </div>
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
              <p className="text-sm font-medium">Couldn't load PDF</p>
              <p className="text-xs text-muted-foreground">{error}</p>
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

export default PdfInlinePreview;