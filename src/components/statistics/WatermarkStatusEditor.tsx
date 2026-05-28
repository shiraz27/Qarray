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
import { Stamp, Clock, XCircle, Ban, Loader2, ChevronDown, Cog, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export type WatermarkStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'not_applicable'
  | null;

const OPTIONS: { value: Exclude<WatermarkStatus, null>; label: string; icon: any; className: string }[] = [
  { value: 'completed', label: 'Completed', icon: Stamp, className: 'text-green-600' },
  { value: 'partial', label: 'Partial', icon: AlertTriangle, className: 'text-amber-600' },
  { value: 'pending', label: 'Pending', icon: Clock, className: 'text-yellow-600' },
  { value: 'in_progress', label: 'In progress', icon: Cog, className: 'text-blue-600' },
  { value: 'failed', label: 'Failed', icon: XCircle, className: 'text-destructive' },
  { value: 'not_applicable', label: 'Not Applicable', icon: Ban, className: 'text-muted-foreground' },
];

function renderBadge(status: WatermarkStatus, pagesDone: number, pageCount: number | null) {
  switch (status) {
    case 'completed':
      return (
        <Badge variant="secondary" className="gap-1">
          <Stamp className="w-3 h-3" />
          {pageCount && pageCount > 1 ? `${pagesDone}/${pageCount}` : 'Stamped'}
        </Badge>
      );
    case 'partial':
      return (
        <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
          <AlertTriangle className="w-3 h-3" />
          {pagesDone}/{pageCount ?? '?'}
        </Badge>
      );
    case 'in_progress':
      return (
        <Badge variant="outline" className="gap-1 border-blue-500 text-blue-600">
          <Cog className="w-3 h-3 animate-spin" />
          {pagesDone}/{pageCount ?? '?'}
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600">
          <Clock className="w-3 h-3" />Pending
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="w-3 h-3" />Failed
        </Badge>
      );
    case 'not_applicable':
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <Ban className="w-3 h-3" />N/A
        </Badge>
      );
    default:
      return <Badge variant="outline" className="gap-1">Unknown</Badge>;
  }
}

interface Props {
  table: 'resources' | 'questions';
  rowId: number;
  status: WatermarkStatus;
  pagesWatermarked: number;
  pageCount: number | null;
  onChanged: (next: WatermarkStatus, pagesWatermarked?: number) => void;
}

export function WatermarkStatusEditor({ table, rowId, status, pagesWatermarked, pageCount, onChanged }: Props) {
  const [saving, setSaving] = useState(false);

  const setStatus = async (next: Exclude<WatermarkStatus, null>) => {
    if (next === status) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = { watermark_status: next };
      if (next === 'pending') {
        updates.watermark_processed_at = null;
        updates.pages_watermarked = 0;
        updates.watermark_error = null;
      }
      const { error } = await (supabase as any).from(table).update(updates).eq('id', rowId);
      if (error) throw error;
      onChanged(next, updates.pages_watermarked);
      toast.success(`Watermark status set to ${next}`);
    } catch (err: any) {
      console.error('[WatermarkStatusEditor] update failed', err);
      toast.error(err?.message ?? 'Failed to update watermark status');
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
          title="Click to manually change watermark status"
        >
          {renderBadge(status, pagesWatermarked, pageCount)}
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-xs">Set watermark status</DropdownMenuLabel>
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
      <div className="text-[10px] font-mono text-muted-foreground">{status ?? 'null'}</div>
    </div>
  );
}