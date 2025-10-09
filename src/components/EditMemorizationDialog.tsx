import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { FlashcardEditor } from './FlashcardEditor';

interface EditMemorizationDialogProps {
  open: boolean;
  onClose: () => void;
  memorizationId: number;
  onSuccess?: () => void;
}

interface Flashcard {
  id?: number;
  front_data: any;
  back_data: any;
  order_index: number;
}

export const EditMemorizationDialog = ({
  open,
  onClose,
  memorizationId,
  onSuccess,
}: EditMemorizationDialogProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(false);
  const [subjectName, setSubjectName] = useState('');
  const [className, setClassName] = useState('');

  useEffect(() => {
    const fetchMemorization = async () => {
      if (!open || !memorizationId) return;

      try {
        // Fetch memorization details
        const { data: mem, error: memError } = await supabase
          .from('memorizations')
          .select(`
            title,
            description,
            is_public,
            subject_id,
            subjects(name, class_id, classes(name))
          `)
          .eq('id', memorizationId)
          .maybeSingle();

        if (memError) throw memError;

        if (mem) {
          setTitle(mem.title);
          setDescription(mem.description || '');
          setIsPublic(mem.is_public);
          setSubjectName((mem.subjects as any)?.name || '');
          setClassName((mem.subjects as any)?.classes?.name || '');
        }

        // Fetch flashcards
        const { data: cards, error: cardsError } = await supabase
          .from('flashcards')
          .select('*')
          .eq('memorization_id', memorizationId)
          .eq('deleted', false)
          .order('order_index');

        if (cardsError) throw cardsError;

        setFlashcards(cards || []);
      } catch (error) {
        console.error('Error fetching memorization:', error);
        toast.error('Failed to load memorization');
      }
    };

    fetchMemorization();
  }, [open, memorizationId]);

  const handleAddFlashcard = () => {
    setFlashcards([
      ...flashcards,
      {
        front_data: { text: '', media: [] },
        back_data: { text: '', media: [] },
        order_index: flashcards.length,
      },
    ]);
  };

  const handleRemoveFlashcard = (index: number) => {
    setFlashcards(flashcards.filter((_, i) => i !== index));
  };

  const handleUpdateFlashcard = (index: number, side: 'front' | 'back', data: any) => {
    const updated = [...flashcards];
    if (side === 'front') {
      updated[index].front_data = data;
    } else {
      updated[index].back_data = data;
    }
    setFlashcards(updated);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    if (flashcards.length === 0) {
      toast.error('Please add at least one flashcard');
      return;
    }

    // Validate flashcards
    for (const card of flashcards) {
      if (!card.front_data?.text && (!card.front_data?.media || card.front_data.media.length === 0)) {
        toast.error('Each flashcard must have content on the front side');
        return;
      }
      if (!card.back_data?.text && (!card.back_data?.media || card.back_data.media.length === 0)) {
        toast.error('Each flashcard must have content on the back side');
        return;
      }
    }

    setLoading(true);
    try {
      // Update memorization
      const { error: memError } = await supabase
        .from('memorizations')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          is_public: isPublic,
        })
        .eq('id', memorizationId);

      if (memError) throw memError;

      // Delete all existing flashcards (soft delete)
      const { error: deleteError } = await supabase
        .from('flashcards')
        .update({ deleted: true })
        .eq('memorization_id', memorizationId);

      if (deleteError) throw deleteError;

      // Insert updated flashcards
      const flashcardsToInsert = flashcards.map((card, index) => ({
        memorization_id: memorizationId,
        front_data: card.front_data,
        back_data: card.back_data,
        order_index: index,
      }));

      const { error: cardsError } = await supabase
        .from('flashcards')
        .insert(flashcardsToInsert);

      if (cardsError) throw cardsError;

      toast.success('Memorization updated successfully!');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('Error updating memorization:', error);
      toast.error(error.message || 'Failed to update memorization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>Edit Memorization</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            {subjectName && (
              <div className="p-3 bg-muted rounded-lg space-y-1">
                <div className="text-sm">
                  <span className="text-muted-foreground">Class: </span>
                  <span className="font-medium">{className}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Subject: </span>
                  <span className="font-medium">{subjectName}</span>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Biology Chapter 5 Terms"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this memorization set..."
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="isPublic">Make Public</Label>
              <Switch
                id="isPublic"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </div>
          </div>

          {/* Flashcards */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-semibold">Flashcards ({flashcards.length})</Label>
              <Button onClick={handleAddFlashcard} size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add Card
              </Button>
            </div>

            {flashcards.map((card, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Card {index + 1}</span>
                  {flashcards.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFlashcard(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-muted-foreground mb-2 block">Front</Label>
                    <FlashcardEditor
                      data={card.front_data}
                      onChange={(data) => handleUpdateFlashcard(index, 'front', data)}
                      placeholder="Enter front content..."
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground mb-2 block">Back</Label>
                    <FlashcardEditor
                      data={card.back_data}
                      onChange={(data) => handleUpdateFlashcard(index, 'back', data)}
                      placeholder="Enter back content..."
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t p-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Updating...' : 'Update Memorization'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
