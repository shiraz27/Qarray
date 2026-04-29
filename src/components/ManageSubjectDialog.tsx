import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface ManageSubjectDialogProps {
  open: boolean;
  onClose: () => void;
  classId: number;
  subjectId?: number | null;
  onSuccess: () => void;
}

const iconOptions = [
  { value: 'calculator', label: 'Calculator (Math)' },
  { value: 'atom', label: 'Atom (Physics/Chemistry)' },
  { value: 'code', label: 'Code (Programming)' },
  { value: 'book-open', label: 'Book (Languages)' },
  { value: 'globe', label: 'Globe (Geography/Languages)' },
  { value: 'beaker', label: 'Beaker (Science)' },
  { value: 'test-tube', label: 'Test Tube (Biology)' },
  { value: 'flask-conical', label: 'Flask (Chemistry)' },
  { value: 'database', label: 'Database' },
];

export const ManageSubjectDialog = ({
  open,
  onClose,
  classId,
  subjectId,
  onSuccess,
}: ManageSubjectDialogProps) => {
  const [name, setName] = useState('');
  const [logo, setLogo] = useState('book-open');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchSubject = async () => {
      if (!subjectId || !open) {
        setName('');
        setLogo('book-open');
        return;
      }

      const { data } = await supabase
        .from('subjects')
        .select('name, logo')
        .eq('id', subjectId)
        .maybeSingle();

      if (data) {
        setName(data.name);
        setLogo(data.logo || 'book-open');
      }
    };

    fetchSubject();
  }, [subjectId, open]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Please enter a subject name');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (subjectId) {
        // Update existing subject
        const { error } = await supabase
          .from('subjects')
          .update({
            name: name.trim(),
            logo: logo,
          })
          .eq('id', subjectId);

        if (error) throw error;
        toast.success('Subject updated successfully');
      } else {
        // Create new subject
        const { error } = await supabase
          .from('subjects')
          .insert({
            name: name.trim(),
            logo: logo,
            class_id: classId,
            contributors: [user.id],
            verified: true,
          });

        if (error) throw error;
        toast.success('Subject created successfully');
      }

      onSuccess();
      onClose();
      setName('');
      setLogo('book-open');
    } catch (error: any) {
      console.error('Error saving subject:', error);
      toast.error(error.message || 'Failed to save subject');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!subjectId) return;
    
    if (!confirm('Are you sure you want to delete this subject? This will also mark all its chapters as deleted.')) {
      return;
    }

    setDeleting(true);
    try {
      // Soft delete the subject
      const { error } = await supabase
        .from('subjects')
        .update({ deleted: true })
        .eq('id', subjectId);

      if (error) throw error;

      // Also soft delete all chapters
      await supabase
        .from('chapters')
        .update({ deleted: true })
        .eq('subject_id', subjectId);

      toast.success('Subject deleted successfully');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error deleting subject:', error);
      toast.error(error.message || 'Failed to delete subject');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{subjectId ? 'Edit Subject' : 'Add Subject'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="name">Subject Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Mathematics"
            />
          </div>

          <div>
            <Label htmlFor="logo">Icon</Label>
            <Select value={logo} onValueChange={setLogo}>
              <SelectTrigger>
                <SelectValue placeholder="Select an icon" />
              </SelectTrigger>
              <SelectContent>
                {iconOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-between gap-3">
          {subjectId && (
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
                subjectId ? 'Update' : 'Create'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
