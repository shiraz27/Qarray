import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ResourceTypeMultiSelect } from '@/components/ResourceTypeMultiSelect';

export type CellVariant = 'text' | 'longText' | 'array' | 'typeIds' | 'number';
export type CellValue = string | string[] | number[] | number | null | undefined;

export interface ResourceTypeLite { id: number; type: string }

interface MetaCellProps {
  variant: CellVariant;
  value: CellValue;
  /** Returns a suggested value of the same shape as `value`, or null if none. */
  onSuggest: () => Promise<CellValue | null>;
  /** Persist the (possibly user-edited) value. Throw to keep the preview open. */
  onSave: (next: CellValue) => Promise<void>;
  resourceTypes?: ResourceTypeLite[];
  /** Disable AI suggestion (e.g. no OCR text yet). */
  canSuggest?: boolean;
  placeholder?: string;
}

function arrToString(v: CellValue): string {
  if (v == null) return '';
  if (Array.isArray(v)) return (v as Array<string | number>).join(', ');
  return String(v);
}

function stringToArray(s: string): string[] {
  return s
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function ChipsDisplay({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1 max-w-[280px]">
      {items.map((item, i) => (
        <Badge key={i} variant="secondary" className="text-xs">
          {item}
        </Badge>
      ))}
    </div>
  );
}

function IdleDisplay({
  variant,
  value,
  resourceTypes,
}: {
  variant: CellVariant;
  value: CellValue;
  resourceTypes?: ResourceTypeLite[];
}) {
  if (variant === 'array') {
    return <ChipsDisplay items={(value as string[] | null) ?? []} />;
  }
  if (variant === 'typeIds') {
    const ids = (value as number[] | null) ?? [];
    const map = new Map((resourceTypes ?? []).map((t) => [t.id, t.type]));
    return <ChipsDisplay items={ids.map((id) => map.get(id) ?? `#${id}`)} />;
  }
  if (variant === 'number') {
    const n = value as number | null | undefined;
    return <span className="text-sm tabular-nums">{n != null ? n : <span className="text-muted-foreground">—</span>}</span>;
  }
  if (variant === 'longText') {
    const s = (value as string | null) ?? '';
    if (!s) return <span className="text-xs text-muted-foreground">—</span>;
    return <div className="text-xs max-w-[280px] whitespace-pre-wrap">{s}</div>;
  }
  const s = (value as string | null) ?? '';
  if (!s) return <span className="text-xs text-muted-foreground">—</span>;
  return <div className="text-sm max-w-[260px] break-words">{s}</div>;
}

export function MetaCell(props: MetaCellProps) {
  const { variant, value, onSuggest, onSave, resourceTypes, canSuggest = true, placeholder } = props;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // null = not in preview; otherwise the editing value.
  // For typeIds it is number[]; for everything else it is a string.
  const [draft, setDraft] = useState<string | number[] | null>(null);

  const startSuggest = async () => {
    setLoading(true);
    try {
      const suggestion = await onSuggest();
      if (suggestion == null || (Array.isArray(suggestion) && suggestion.length === 0) || suggestion === '') {
        toast.info('No suggestion from AI for this field');
        // Still open editor with current value so user can edit manually.
        if (variant === 'typeIds') setDraft(((value as number[] | null) ?? []).slice());
        else setDraft(arrToString(value));
        return;
      }
      if (variant === 'typeIds') setDraft(((suggestion as number[] | null) ?? []).slice());
      else setDraft(arrToString(suggestion));
    } catch (err: any) {
      console.error('[MetaCell] suggest error', err);
      toast.error(err?.message ?? 'AI suggestion failed');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = () => {
    if (variant === 'typeIds') setDraft(((value as number[] | null) ?? []).slice());
    else setDraft(arrToString(value));
  };
  const discard = () => setDraft(null);

  const confirm = async () => {
    if (draft == null) return;
    setSaving(true);
    try {
      let next: CellValue;
      if (variant === 'typeIds') {
        next = (draft as number[]) ?? [];
      } else if (variant === 'array') {
        next = stringToArray(draft as string);
      } else if (variant === 'number') {
        const trimmed = (draft as string).trim();
        next = trimmed === '' ? null : parseInt(trimmed, 10);
        if (next != null && Number.isNaN(next as number)) {
          toast.error('Not a valid number');
          setSaving(false);
          return;
        }
      } else {
        next = draft as string;
      }
      await onSave(next);
      setDraft(null);
      toast.success('Saved');
    } catch (err: any) {
      console.error('[MetaCell] save error', err);
      toast.error(err?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (draft != null) {
    return (
      <div className="space-y-1.5 ring-1 ring-primary/40 rounded-md p-1.5 bg-primary/5">
        {variant === 'typeIds' ? (
          <ResourceTypeMultiSelect
            options={resourceTypes ?? []}
            value={(draft as number[]) ?? []}
            onChange={(next) => setDraft(next)}
            placeholder="Select types"
          />
        ) : variant === 'longText' ? (
          <Textarea
            value={draft as string}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="text-xs min-h-[60px]"
          />
        ) : (
          <Input
            value={draft as string}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              placeholder ??
              (variant === 'array'
                ? 'comma, separated, values'
                : variant === 'number'
                  ? 'number'
                  : '')
            }
            type={variant === 'number' ? 'number' : 'text'}
            className="h-8 text-xs"
          />
        )}
        <div className="flex items-center gap-1">
          <Button size="sm" variant="default" className="h-6 px-2 text-xs gap-1" onClick={confirm} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Confirm
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={discard} disabled={saving}>
            <X className="h-3 w-3" />
            Discard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1 group">
      <div className="flex-1 min-w-0">
        <IdleDisplay variant={variant} value={value} resourceTypes={resourceTypes} />
      </div>
      <div className="flex items-center opacity-60 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={startSuggest}
          disabled={loading || !canSuggest}
          title={canSuggest ? 'AI suggest for this field' : 'No OCR text available'}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-muted-foreground"
          onClick={startEdit}
          title="Edit manually"
        >
          <span className="text-xs">✎</span>
        </Button>
      </div>
    </div>
  );
}