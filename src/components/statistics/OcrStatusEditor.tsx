import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CheckCircle2, Clock, XCircle, Ban, Loader2, ChevronDown, Cog } from 'lucide-react';
import { toast } from 'sonner';

export type OcrStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'not_applicable' | null;

const OPTIONS: { value: Exclude<OcrStatus, null>; label: string; icon: any; className: string }[] = [
  { value: 'completed', label: 'Completed', icon: CheckCircle2, className: 'text-green-600' },
  { value: 'pending', label: 'Pending', icon: Clock, className: 'text-yellow-600' },
  { value: 'processing', label: 'Processing', icon: Cog, className: 'text-blue-600' },
  { value: 'failed', label: 'Failed', icon: XCircle, className: 'text-destructive' },
  { value: 'not_applicable', label: 'Not Applicable', icon: Ban, className: 'text-muted-foreground' },
];

function renderBadge(status: OcrStatus) {
  switch (status) {
    case 'completed':
      return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" />Completed</Badge>;
    case 'pending':
      return <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600"><Clock className="w-3 h-3" />Pending</Badge>;
    case 'processing':
      return <Badge variant="outline" className="gap-1 border-blue-500 text-blue-600"><Cog className="w-3 h-3" />Processing</Badge>;
    case 'failed':
      return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Failed</Badge>;
    case 'not_applicable':
      return <Badge variant="outline" className="gap-1 text-muted-foreground"><Ban className="w-3 h-3" />N/A</Badge>;
    default:
      return <Badge variant="outline" className="gap-1">Unknown</Badge>;
  }
}

interface Props {
  table: 'resources' | 'questions';
  rowId: number;
  status: OcrStatus;
  onChanged: (next: OcrStatus) => void;
}

export function OcrStatusEditor({ table, rowId, status, onChanged }: Props) {
  const [saving, setSaving] = useState(false);

  const setStatus = async (next: Exclude<OcrStatus, null>) => {
    if (next === status) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = { ocr_status: next };
      // If marking back to pending/processing, clear processed timestamp so it can be re-run cleanly.
      if (next === 'pending') {
        updates.ocr_processed_at = null;
      }
      const { error } = await (supabase as any).from(table).update(updates).eq('id', rowId);
      if (error) throw error;
      onChanged(next);
      toast.success(`OCR status set to ${next}`);
    } catch (err: any) {
      console.error('[OcrStatusEditor] update failed', err);
      toast.error(err?.message ?? 'Failed to update OCR status');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md hover:opacity-80 disabled:opacity-50"
          title="Click to manually change OCR status"
        >
          {renderBadge(status)}
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-xs">Set OCR status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = opt.value === status;
            return (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => setStatus(opt.value)}
                className="gap-2 text-xs cursor-pointer"
              >
                <Icon className={`h-3.5 w-3.5 ${opt.className}`} />
                <span className={active ? 'font-semibold' : ''}>{opt.label}</span>
                {active && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="text-[10px] font-mono text-muted-foreground">
        {status ?? 'null'}
      </div>
    </div>
  );
}