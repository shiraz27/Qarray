import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Layers, Scissors, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { isPdfUrl, isSplitPdfManifestUrl } from '@/utils/mediaTypeUtils';
import {
  migrateResourcePdfs,
  migrateQuestionPdfs,
  type BackfillProgress,
} from '@/utils/pdfBackfill';

type Props =
  | {
      kind: 'resource';
      row: { id: number; data: string[]; chapter_id: number | null };
      onChanged: (newData: string[]) => void;
    }
  | {
      kind: 'question';
      row: { id: number; data: string; chapter_id: number | null };
      urls: string[];
      onChanged: (newText: string) => void;
    };

export function PdfSplitCell(props: Props) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BackfillProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const warningsRef =
    // collect raster/failed counts across all URLs in this run
    (typeof window !== 'undefined' ? { current: { raster: 0, failed: 0 } } : { current: { raster: 0, failed: 0 } });

  const urls = props.kind === 'resource' ? props.row.data : props.urls;

  const status = useMemo(() => {
    const pdfUrls = urls.filter(isPdfUrl);
    if (pdfUrls.length === 0) return 'no-pdf' as const;
    const unsplit = pdfUrls.filter((u) => !isSplitPdfManifestUrl(u));
    if (unsplit.length === 0) return 'split' as const;
    return 'not-split' as const;
  }, [urls]);

  const unsplitCount = useMemo(
    () => urls.filter((u) => isPdfUrl(u) && !isSplitPdfManifestUrl(u)).length,
    [urls],
  );

  const handleMigrate = async () => {
    setRunning(true);
    setError(null);
    let totalRaster = 0;
    let totalFailed = 0;
    const trackProgress = (p: BackfillProgress) => {
      if (p.rasterizedPages) totalRaster += p.rasterizedPages;
      if (p.failedPages) totalFailed += p.failedPages;
      setProgress(p);
    };
    try {
      if (props.kind === 'resource') {
        const next = await migrateResourcePdfs(props.row, trackProgress);
        props.onChanged(next);
      } else {
        const next = await migrateQuestionPdfs(props.row, props.urls, trackProgress);
        props.onChanged(next);
      }
      if (totalFailed > 0) {
        toast.warning(
          `PDF migrated — ${totalRaster} page(s) rasterized, ${totalFailed} page(s) skipped (unrecoverable source)`,
        );
      } else if (totalRaster > 0) {
        toast.warning(
          `PDF migrated — ${totalRaster} page(s) rasterized due to malformed source`,
        );
      } else {
        toast.success('PDF migrated to per-page');
      }
    } catch (e: any) {
      const msg = e?.message || 'Migration failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  if (status === 'no-pdf') {
    return <Badge variant="outline" className="text-muted-foreground">—</Badge>;
  }

  return (
    <div className="flex flex-col gap-1">
      {status === 'split' ? (
        <Badge variant="secondary" className="gap-1 w-fit">
          <Layers className="h-3 w-3" /> Per-page
        </Badge>
      ) : (
        <Badge variant="destructive" className="gap-1 w-fit">
          <Scissors className="h-3 w-3" /> Single ({unsplitCount})
        </Badge>
      )}

      {status === 'not-split' && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2"
          onClick={handleMigrate}
          disabled={running}
        >
          {running ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              {progress
                ? progress.phase === 'upload-page'
                  ? `p${progress.currentPage}/${progress.totalPages}`
                  : progress.phase
                : '…'}
            </>
          ) : (
            'Migrate'
          )}
        </Button>
      )}

      {error && (
        <div className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          <span className="truncate max-w-[140px]" title={error}>{error}</span>
        </div>
      )}
    </div>
  );
}