import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Image as ImageIcon, Layers, Scan } from 'lucide-react';
import type { OcrMode, OcrPsm } from '@/utils/pdfOcrHelpers';

export interface OcrScanContext {
  chapterName?: string | null;
  subjectName?: string | null;
  className?: string | null;
  book?: string | null;
  teacher?: string | null;
  school?: string | null;
  resourceType?: string | null;
  /** When true, an existing completed OCR will be overwritten. */
  currentStatus?: string | null;
}

export interface OcrScanSubmit {
  mode: OcrMode;
  langs?: string; // undefined ⇒ auto
  psm: OcrPsm;
  contextHint: string;
  force: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'resource' | 'question';
  id: number | null;
  context: OcrScanContext;
  onRun: (opts: OcrScanSubmit) => void;
  running?: boolean;
}

const LANG_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto-detect (French · Arabic · English)' },
  { value: 'fra', label: 'French only' },
  { value: 'ara', label: 'Arabic only' },
  { value: 'eng', label: 'English only' },
  { value: 'fra+ara', label: 'French + Arabic' },
  { value: 'ara+fra', label: 'Arabic + French' },
  { value: 'fra+eng', label: 'French + English' },
  { value: 'fra+ara+eng', label: 'French + Arabic + English' },
];

const PSM_OPTIONS: { value: OcrPsm; label: string }[] = [
  { value: '6', label: 'Single block of text (default)' },
  { value: '3', label: 'Automatic page segmentation' },
  { value: '4', label: 'Single column, variable sizes' },
  { value: '11', label: 'Sparse text (find any text)' },
];

function buildAutoContext(ctx: OcrScanContext): string {
  const parts: string[] = [];
  if (ctx.className) parts.push(`Class: ${ctx.className}`);
  if (ctx.subjectName) parts.push(`Subject: ${ctx.subjectName}`);
  if (ctx.chapterName) parts.push(`Chapter: ${ctx.chapterName}`);
  if (ctx.resourceType) parts.push(`Type: ${ctx.resourceType}`);
  if (ctx.book) parts.push(`Book: ${ctx.book}`);
  if (ctx.teacher) parts.push(`Teacher: ${ctx.teacher}`);
  if (ctx.school) parts.push(`School: ${ctx.school}`);
  return parts.join(' · ');
}

export function OcrScanDialog({
  open,
  onOpenChange,
  kind,
  id,
  context,
  onRun,
  running = false,
}: Props) {
  const [mode, setMode] = useState<OcrMode>('mixed');
  const [lang, setLang] = useState<string>('auto');
  const [psm, setPsm] = useState<OcrPsm>('6');
  const [notes, setNotes] = useState<string>('');
  const [includeContext, setIncludeContext] = useState<boolean>(true);
  const [force, setForce] = useState<boolean>(false);

  const autoContext = useMemo(() => buildAutoContext(context), [context]);
  const alreadyCompleted = context.currentStatus === 'completed';

  // Reset on each open so prior runs don't leak settings.
  useEffect(() => {
    if (open) {
      setMode('mixed');
      setLang('auto');
      setPsm('6');
      setNotes('');
      setIncludeContext(true);
      setForce(alreadyCompleted);
    }
  }, [open, alreadyCompleted]);

  const handleRun = () => {
    const ctxParts: string[] = [];
    if (includeContext && autoContext) ctxParts.push(autoContext);
    if (notes.trim()) ctxParts.push(`Notes: ${notes.trim()}`);
    onRun({
      mode,
      langs: lang === 'auto' ? undefined : lang,
      psm,
      contextHint: ctxParts.join(' · '),
      force,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            Run OCR — {kind} #{id ?? '?'}
          </DialogTitle>
          <DialogDescription>
            Tune language, layout, and context to improve OCR quality for this
            {kind === 'resource' ? ' resource' : ' question'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Auto-detected context */}
          <div className="rounded-md border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Auto context
              </Label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={includeContext}
                  onCheckedChange={(v) => setIncludeContext(!!v)}
                />
                Embed in result
              </label>
            </div>
            {autoContext ? (
              <div className="flex flex-wrap gap-1.5">
                {context.className && <Badge variant="secondary">Class: {context.className}</Badge>}
                {context.subjectName && <Badge variant="secondary">Subject: {context.subjectName}</Badge>}
                {context.chapterName && <Badge variant="secondary">Chapter: {context.chapterName}</Badge>}
                {context.resourceType && <Badge variant="secondary">Type: {context.resourceType}</Badge>}
                {context.book && <Badge variant="outline">Book: {context.book}</Badge>}
                {context.teacher && <Badge variant="outline">Teacher: {context.teacher}</Badge>}
                {context.school && <Badge variant="outline">School: {context.school}</Badge>}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No context available for this row.
              </p>
            )}
          </div>

          {/* Mode */}
          <div className="space-y-2">
            <Label>OCR mode</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: 'text' as const, label: 'Text', icon: FileText, hint: 'Digital PDFs' },
                { v: 'image' as const, label: 'Image', icon: ImageIcon, hint: 'Scans / photos' },
                { v: 'mixed' as const, label: 'Mixed', icon: Layers, hint: 'Most thorough' },
              ]).map(({ v, label, icon: Icon, hint }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMode(v)}
                  className={`flex flex-col items-start gap-1 rounded-md border p-2 text-left transition ${
                    mode === v
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Language + PSM */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={lang} onValueChange={setLang}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANG_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Layout (PSM)</Label>
              <Select value={psm} onValueChange={(v) => setPsm(v as OcrPsm)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PSM_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="ocr-notes">Additional notes (optional)</Label>
            <Textarea
              id="ocr-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. handwritten in margins, mostly equations, French questions with Arabic instructions…"
              rows={3}
            />
          </div>

          {alreadyCompleted && (
            <label className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <Checkbox checked={force} onCheckedChange={(v) => setForce(!!v)} />
              Overwrite existing OCR result (force retry)
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button
            onClick={handleRun}
            disabled={running || (alreadyCompleted && !force)}
          >
            {running ? 'Running…' : 'Run OCR'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}