import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Copy, Pencil, Save, X, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  table: 'resources' | 'questions';
  rowId: number;
  text: string | null;
  onChanged: (next: string | null) => void;
}

export function OcrTextEditor({ table, rowId, text, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text ?? '');
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(text ?? '');
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(text ?? '');
  };

  const save = async () => {
    setSaving(true);
    try {
      const next = draft.trim() === '' ? null : draft;
      const { error } = await (supabase as any)
        .from(table)
        .update({ ocr_text: next, ocr_processed_at: new Date().toISOString() })
        .eq('id', rowId);
      if (error) throw error;
      onChanged(next);
      toast.success('OCR text saved');
      setEditing(false);
    } catch (err: any) {
      console.error('[OcrTextEditor] save failed', err);
      toast.error(err?.message ?? 'Failed to save OCR text');
    } finally {
      setSaving(false);
    }
  };

  const preview = text
    ? `${text.substring(0, 60)}${text.length > 60 ? '…' : ''}`
    : null;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) cancel(); }}>
      <PopoverTrigger asChild>
        {preview ? (
          <button className="text-xs text-left text-muted-foreground hover:text-foreground max-w-[200px] truncate underline-offset-2 hover:underline inline-flex items-center gap-1">
            <FileText className="h-3 w-3 shrink-0" />
            <span className="truncate">{preview}</span>
          </button>
        ) : (
          <button className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <Pencil className="h-3 w-3" />
            <span className="italic">add OCR text</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[520px] max-h-[460px] overflow-auto">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="text-xs font-medium text-muted-foreground">
            OCR text {text ? `(${text.length} chars)` : '(empty)'}
          </div>
          <div className="flex items-center gap-1">
            {!editing && text && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1"
                onClick={() => {
                  navigator.clipboard.writeText(text);
                  toast.success('Copied OCR text');
                }}
              >
                <Copy className="h-3 w-3" />
                Copy
              </Button>
            )}
            {!editing ? (
              <Button size="sm" variant="outline" className="h-7 gap-1" onClick={startEdit}>
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            ) : (
              <>
                <Button size="sm" variant="default" className="h-7 gap-1" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={cancel} disabled={saving}>
                  <X className="h-3 w-3" />
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
        {editing ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste or edit OCR text…"
            className="text-xs font-mono min-h-[280px] resize-y"
          />
        ) : text ? (
          <pre className="text-xs whitespace-pre-wrap break-words">{text}</pre>
        ) : (
          <div className="text-xs text-muted-foreground italic">No OCR text. Click Edit to add one manually.</div>
        )}
      </PopoverContent>
    </Popover>
  );
}