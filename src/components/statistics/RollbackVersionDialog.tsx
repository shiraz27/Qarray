import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, History, RotateCcw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  listRollbackVersions,
  restoreRowToVersion,
  type RollbackTable,
  type RollbackUrlInfo,
  type RollbackVersion,
} from '@/utils/pdfRollback';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  table: RollbackTable;
  rowId: number;
  onRestored?: () => void;
}

function formatBytes(n?: number) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(unix?: number) {
  if (!unix) return '—';
  try {
    return new Date(unix * 1000).toLocaleString();
  } catch {
    return '—';
  }
}

export function RollbackVersionDialog({ open, onOpenChange, table, rowId, onRestored }: Props) {
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [info, setInfo] = useState<RollbackUrlInfo[]>([]);
  const [choice, setChoice] = useState<RollbackVersion>('earliest');

  useEffect(() => {
    if (!open) return;
    setInfo([]);
    setChoice('earliest');
    setLoading(true);
    listRollbackVersions(table, rowId)
      .then((urls) => setInfo(urls))
      .catch((e) => toast.error(e?.message || 'Failed to load versions'))
      .finally(() => setLoading(false));
  }, [open, table, rowId]);

  const anyHistory = info.some((u) => (u.versions?.length ?? 0) > 0);

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const res = await restoreRowToVersion(table, rowId, choice);
      if (res.restored > 0) {
        toast.success(
          `Restored ${res.restored}/${res.total} file(s)${res.skipped ? `, skipped ${res.skipped}` : ''}`,
        );
        onRestored?.();
        onOpenChange(false);
      } else {
        toast.error(`Nothing restored. ${res.errors[0] || 'No history available.'}`);
      }
      if (res.errors.length > 0) console.warn('[rollback] errors', res.errors);
    } catch (e: any) {
      toast.error(e?.message || 'Rollback failed');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Rollback PDF to a healthy version
          </DialogTitle>
          <DialogDescription>
            Archive.org keeps prior versions of every overwritten file. Pick which version to restore — the
            current live file will be replaced.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading versions…
          </div>
        ) : info.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> No media URLs on this row.
          </div>
        ) : !anyHistory ? (
          <div className="py-6 text-sm text-muted-foreground flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> No history available — the current file is the original.
          </div>
        ) : (
          <>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant={choice === 'earliest' ? 'default' : 'outline'}
                onClick={() => setChoice('earliest')}
              >
                Earliest (pristine original)
              </Button>
              <Button
                size="sm"
                variant={choice === 'previous' ? 'default' : 'outline'}
                onClick={() => setChoice('previous')}
              >
                Most recent backup
              </Button>
            </div>

            <div className="max-h-[40vh] overflow-y-auto space-y-3 border rounded-md p-3 bg-muted/30">
              {info.map((u, i) => (
                <div key={i} className="text-xs space-y-1">
                  <div className="font-mono text-muted-foreground truncate">
                    {u.key || '(non-archive URL)'}
                  </div>
                  {u.versions.length === 0 ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      no history
                    </Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.versions.map((v) => {
                        const isPicked =
                          (choice === 'earliest' && v.n === u.versions[0].n) ||
                          (choice === 'previous' && v.n === u.versions[u.versions.length - 1].n) ||
                          (typeof choice === 'number' && v.n === choice);
                        return (
                          <button
                            key={v.n}
                            type="button"
                            onClick={() => setChoice(v.n)}
                            className={`px-2 py-0.5 rounded border text-[11px] ${
                              isPicked
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background hover:bg-accent'
                            }`}
                            title={`${formatBytes(v.size)} • ${formatDate(v.mtime)}`}
                          >
                            v{v.n}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={restoring}>
            Cancel
          </Button>
          <Button onClick={handleRestore} disabled={restoring || !anyHistory}>
            {restoring ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}