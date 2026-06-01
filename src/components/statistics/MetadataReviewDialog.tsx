import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles } from 'lucide-react';
import type { ExtractedMetadata, MetadataField } from '@/utils/metadataExtractor';

export interface MetadataReviewTarget {
  kind: 'resource' | 'question';
  id: number;
  current: {
    title?: string | null;
    description?: string | null;
    teacher_names?: string[] | null;
    school_names?: string[] | null;
    books?: string[] | null;
    type_id?: number | null;
    devoir_type_id?: number | null;
  };
  proposed: ExtractedMetadata;
}

interface Props {
  open: boolean;
  target: MetadataReviewTarget | null;
  applying: boolean;
  onDiscard: () => void;
  onApply: (fields: MetadataField[]) => void;
}

function PreviewArray({ label, current, proposed }: { label: string; current: string[]; proposed: string[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <div className="text-xs text-muted-foreground mb-1">Current</div>
        <div className="flex flex-wrap gap-1 min-h-[20px]">
          {current.length === 0 ? <span className="text-xs text-muted-foreground">—</span> :
            current.map((c, i) => <Badge key={i} variant="outline" className="text-xs">{c}</Badge>)}
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1">After apply (merged)</div>
        <div className="flex flex-wrap gap-1 min-h-[20px]">
          {(() => {
            const seen = new Set<string>();
            const merged = [...current, ...proposed].filter((v) => {
              const k = (v ?? '').trim().toLowerCase();
              if (!k || seen.has(k)) return false;
              seen.add(k);
              return true;
            });
            return merged.map((c, i) => {
              const isNew = !current.some((x) => x.trim().toLowerCase() === c.trim().toLowerCase());
              return (
                <Badge key={i} variant={isNew ? 'default' : 'outline'} className="text-xs">
                  {isNew ? '+ ' : ''}{c}
                </Badge>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}

function PreviewText({ label, current, proposed }: { label: string; current: string; proposed: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <div className="text-xs text-muted-foreground mb-1">Current</div>
        <div className="text-sm whitespace-pre-wrap break-words rounded bg-muted/40 p-2 min-h-[40px]">
          {current || <span className="text-muted-foreground text-xs">—</span>}
        </div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1">Proposed</div>
        <div className="text-sm whitespace-pre-wrap break-words rounded bg-primary/10 p-2 min-h-[40px]">
          {proposed || <span className="text-muted-foreground text-xs">—</span>}
        </div>
      </div>
    </div>
  );
}

export function MetadataReviewDialog({ open, target, applying, onDiscard, onApply }: Props) {
  const fields = useMemo<Array<{ key: MetadataField; label: string; hasProposal: boolean; render: () => JSX.Element }>>(() => {
    if (!target) return [];
    const c = target.current;
    const p = target.proposed;
    const arr = (x: string[] | null | undefined) => x ?? [];
    const isResource = target.kind === 'resource';
    const list: Array<{ key: MetadataField; label: string; hasProposal: boolean; render: () => JSX.Element }> = [];

    if (isResource) {
      list.push({
        key: 'title',
        label: 'Title',
        hasProposal: !!p.suggested_title,
        render: () => <PreviewText label="Title" current={c.title ?? ''} proposed={p.suggested_title ?? ''} />,
      });
      list.push({
        key: 'description',
        label: 'Description (appends AI block)',
        hasProposal: !!p.suggested_description || !!p.school_name || !!p.teacher_name,
        render: () => (
          <PreviewText
            label="Description"
            current={c.description ?? ''}
            proposed={p.suggested_description ?? ''}
          />
        ),
      });
    }

    list.push({
      key: 'teachers',
      label: 'Teachers',
      hasProposal: arr(p.teacher_names).length > 0,
      render: () => <PreviewArray label="Teachers" current={arr(c.teacher_names)} proposed={arr(p.teacher_names)} />,
    });
    list.push({
      key: 'schools',
      label: 'Schools',
      hasProposal: arr(p.school_names).length > 0,
      render: () => <PreviewArray label="Schools" current={arr(c.school_names)} proposed={arr(p.school_names)} />,
    });
    list.push({
      key: 'books',
      label: 'Books',
      hasProposal: arr(p.books).length > 0,
      render: () => <PreviewArray label="Books" current={arr(c.books)} proposed={arr(p.books)} />,
    });
    list.push({
      key: 'types',
      label: 'Type / Devoir type',
      hasProposal: !!p.suggested_type_id || (isResource && !!p.suggested_devoir_type_id),
      render: () => (
        <PreviewText
          label="Types"
          current={[c.type_id ? `type=#${c.type_id}` : null, isResource && c.devoir_type_id ? `devoir=#${c.devoir_type_id}` : null].filter(Boolean).join(', ')}
          proposed={[p.suggested_type_id ? `type=#${p.suggested_type_id}` : null, isResource && p.suggested_devoir_type_id ? `devoir=#${p.suggested_devoir_type_id}` : null].filter(Boolean).join(', ')}
        />
      ),
    });

    return list;
  }, [target]);

  const [selected, setSelected] = useState<Set<MetadataField>>(new Set());

  // Reset selection when a new target opens — default to all fields with proposals.
  useMemo(() => {
    if (target) {
      setSelected(new Set(fields.filter((f) => f.hasProposal).map((f) => f.key)));
    } else {
      setSelected(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id, target?.kind]);

  const toggle = (k: MetadataField) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const anyProposals = fields.some((f) => f.hasProposal);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !applying) onDiscard(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Review AI-extracted metadata
          </DialogTitle>
          <DialogDescription>
            {target ? `${target.kind === 'resource' ? 'Resource' : 'Question'} #${target.id} — pick the fields you want to apply.` : ''}
          </DialogDescription>
        </DialogHeader>

        {!anyProposals ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            AI did not return any usable metadata for this item.
          </div>
        ) : (
          <div className="space-y-4">
            {fields.map((f) => (
              <div
                key={f.key}
                className={`rounded-md border p-3 ${f.hasProposal ? '' : 'opacity-50'}`}
              >
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={selected.has(f.key)}
                    disabled={!f.hasProposal || applying}
                    onCheckedChange={() => toggle(f.key)}
                  />
                  <div className="flex-1 space-y-2">
                    <div className="text-sm font-medium flex items-center gap-2">
                      {f.label}
                      {!f.hasProposal && (
                        <Badge variant="outline" className="text-xs">no proposal</Badge>
                      )}
                    </div>
                    {f.hasProposal && f.render()}
                  </div>
                </label>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onDiscard} disabled={applying}>Discard</Button>
          <Button
            onClick={() => onApply(Array.from(selected))}
            disabled={applying || selected.size === 0}
          >
            {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Apply selected ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}