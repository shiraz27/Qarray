import { useState } from 'react';
import { Flag } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logAppEvent } from '@/utils/appEvents';

export type ReportableType = 'resource' | 'question' | 'answer';

const REASONS: { value: string; label: string }[] = [
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'quality', label: 'Low quality' },
  { value: 'missing', label: 'Missing or broken' },
  { value: 'incorrect', label: 'Incorrect information' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Other' },
];

const schema = z.object({
  reason: z.enum(['inappropriate', 'quality', 'missing', 'incorrect', 'spam', 'other']),
  details: z.string().trim().max(1000).optional(),
});

interface Props {
  contentType: ReportableType;
  contentId: number;
  variant?: 'icon' | 'inline';
  className?: string;
}

export function ReportButton({ contentType, contentId, variant = 'icon', className }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState<string>('inappropriate');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReason('inappropriate');
    setDetails('');
  };

  const handleSubmit = async () => {
    const parsed = schema.safeParse({ reason, details: details || undefined });
    if (!parsed.success) {
      toast({ title: 'Invalid input', description: parsed.error.issues[0].message, variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        toast({ title: 'Sign in required', description: 'Please sign in to report content.', variant: 'destructive' });
        return;
      }
      const { error } = await supabase.from('content_reports').insert({
        content_type: contentType,
        content_id: contentId,
        reporter_id: auth.user.id,
        reason: parsed.data.reason,
        details: parsed.data.details ?? null,
      } as never);
      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Already reported', description: 'You already have an open report for this item.' });
        } else {
          throw error;
        }
      } else {
        toast({ title: 'Report submitted', description: 'Thanks — admins will review it.' });
        logAppEvent({
          severity: 'info',
          category: 'other',
          event_type: 'content_reported',
          content_type: contentType === 'answer' ? 'question' : contentType,
          content_id: contentId,
          metadata: { reason: parsed.data.reason, real_content_type: contentType },
        });
      }
      setFormOpen(false);
      reset();
    } catch (e) {
      toast({ title: 'Could not submit report', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const trigger =
    variant === 'inline' ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={className}
        onClick={() => setConfirmOpen(true)}
      >
        <Flag className="mr-1" /> Report
      </Button>
    ) : (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={className}
        onClick={() => setConfirmOpen(true)}
        aria-label="Report"
        title="Report"
      >
        <Flag />
      </Button>
    );

  return (
    <>
      {trigger}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Report this {contentType}?</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to report something wrong to admins? You'll be able to choose a reason
              and add details.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                setFormOpen(true);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report {contentType}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <RadioGroup value={reason} onValueChange={setReason}>
                {REASONS.map((r) => (
                  <div key={r.value} className="flex items-center gap-2">
                    <RadioGroupItem id={`reason-${r.value}-${contentType}-${contentId}`} value={r.value} />
                    <Label htmlFor={`reason-${r.value}-${contentType}-${contentId}`} className="font-normal">
                      {r.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`details-${contentType}-${contentId}`}>Details (optional)</Label>
              <Textarea
                id={`details-${contentType}-${contentId}`}
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
                placeholder="Add more context for admins…"
                rows={4}
              />
              <p className="text-xs text-muted-foreground text-right">{details.length}/1000</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}