import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, X, Pencil, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SourceLinkCellProps {
  resourceId: number;
  value: string | null;
  onSaved: (next: string | null) => void;
}

const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());

export function SourceLinkCell({ resourceId, value, onSaved }: SourceLinkCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  const dirty = (draft ?? '') !== (value ?? '');

  const handleSave = async () => {
    const next = draft.trim() || null;
    setSaving(true);
    const { error } = await (supabase as any)
      .from('resources')
      .update({ source_link: next })
      .eq('id', resourceId);
    setSaving(false);
    if (error) {
      toast.error(`Failed to save: ${error.message}`);
      return;
    }
    toast.success('Source updated');
    onSaved(next);
    setEditing(false);
  };

  const handleDiscard = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 min-w-[220px]">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="URL or book name"
          className="h-8 text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleDiscard();
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={handleSave}
          disabled={saving || !dirty}
          title="Save"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={handleDiscard}
          disabled={saving}
          title="Discard"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 min-w-[180px] max-w-[260px]">
      {value ? (
        isUrl(value) ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline truncate inline-flex items-center gap-1"
            title={value}
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{value}</span>
          </a>
        ) : (
          <span className="text-xs truncate" title={value}>{value}</span>
        )
      ) : (
        <span className="text-xs text-muted-foreground italic">—</span>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0"
        onClick={() => setEditing(true)}
        title="Edit source"
      >
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}