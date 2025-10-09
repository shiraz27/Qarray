import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface ManageChapterDialogProps {
  open: boolean;
  onClose: () => void;
  subjectId: number;
  classId: number;
  chapterId?: number | null;
  onSuccess: () => void;
}

export const ManageChapterDialog = ({
  open,
  onClose,
  subjectId,
  classId,
  chapterId,
  onSuccess,
}: ManageChapterDialogProps) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchChapter = async () => {
      if (!chapterId || !open) {
        setName('');
        return;
      }

      const { data } = await supabase
        .from('chapters')
        .select('name')
        .eq('id', chapterId)
        .maybeSingle();

      if (data) {
        setName(data.name);
      }
    };

    fetchChapter();
  }, [chapterId, open]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Please enter a chapter name');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (chapterId) {
        // Update existing chapter
        const { error } = await supabase
          .from('chapters')
          .update({
            name: name.trim(),
          })
          .eq('id', chapterId);

        if (error) throw error;
        toast.success('Chapter updated successfully');
      } else {
        // Create new chapter
        const { error } = await supabase
          .from('chapters')
          .insert({
            name: name.trim(),
            subject_id: subjectId,
            class_id: classId,
            contributors: [user.id],
            verified: true,
          });

        if (error) throw error;
        toast.success('Chapter created successfully');
      }

      onSuccess();
      onClose();
      setName('');
    } catch (error: any) {
      console.error('Error saving chapter:', error);
      toast.error(error.message || 'Failed to save chapter');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!chapterId) return;
    
    if (!confirm('Are you sure you want to delete this chapter?')) {
      return;
    }

    setDeleting(true);
    try {
      // Soft delete the chapter
      const { error } = await supabase
        .from('chapters')
        .update({ deleted: true })
        .eq('id', chapterId);

      if (error) throw error;

      toast.success('Chapter deleted successfully');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error deleting chapter:', error);
      toast.error(error.message || 'Failed to delete chapter');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{chapterId ? 'Edit Chapter' : 'Add Chapter'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="name">Chapter Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Chapter 1: Introduction"
            />
          </div>
        </div>

        <div className="flex justify-between gap-3">
          {chapterId && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading || deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          )}
          <div className="flex gap-3 ml-auto">
            <Button variant="outline" onClick={onClose} disabled={loading || deleting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading || deleting}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                chapterId ? 'Update' : 'Create'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
