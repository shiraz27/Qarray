import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { FlashcardEditor } from './FlashcardEditor';

interface CreateMemorizationDialogProps {
  open: boolean;
  onClose: () => void;
  subjectId?: number;
  chapterId?: number;
}

interface Flashcard {
  front_data: any;
  back_data: any;
  order_index: number;
}

export const CreateMemorizationDialog = ({
  open,
  onClose,
  subjectId,
  chapterId,
}: CreateMemorizationDialogProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([
    { front_data: { text: '', media: [] }, back_data: { text: '', media: [] }, order_index: 0 },
  ]);
  const [loading, setLoading] = useState(false);
  const [editingCardIndex, setEditingCardIndex] = useState<number | null>(null);
  const [classId, setClassId] = useState<number | null>(null);
  const [subjectName, setSubjectName] = useState<string>('');
  const [className, setClassName] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);

  // Fetch user's class and subjects
  useEffect(() => {
    const fetchUserData = async () => {
      if (!open) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's class
      const { data: profile } = await supabase
        .from('profiles')
        .select('class_id, classes(name)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile?.class_id) {
        setClassId(profile.class_id);
        setClassName((profile.classes as any)?.name || '');

        // If no subjectId provided, fetch subjects for the class
        if (!subjectId) {
          const { data: subjectsData } = await supabase
            .from('subjects')
            .select('id, name')
            .eq('class_id', profile.class_id)
            .eq('deleted', false)
            .order('name');
          
          setSubjects(subjectsData || []);
        }
      }

      // If subjectId is provided, fetch subject details
      if (subjectId) {
        const { data: subject } = await supabase
          .from('subjects')
          .select('name, class_id, classes(name)')
          .eq('id', subjectId)
          .maybeSingle();

        if (subject) {
          setClassId(subject.class_id);
          setSubjectName(subject.name);
          setClassName((subject.classes as any)?.name || '');
          setSelectedSubjectId(subjectId);
        }
      }

      // Set selected chapter if provided
      if (chapterId) {
        setSelectedChapterId(chapterId);
      }
    };

    fetchUserData();
  }, [open, subjectId, chapterId]);

  // Fetch chapters when subject is selected
  useEffect(() => {
    const fetchChapters = async () => {
      const targetSubjectId = selectedSubjectId || subjectId;
      if (!targetSubjectId) {
        setChapters([]);
        return;
      }

      const { data: chaptersData } = await supabase
        .from('chapters')
        .select('id, name')
        .eq('subject_id', targetSubjectId)
        .eq('deleted', false)
        .order('name');
      
      setChapters(chaptersData || []);
    };

    fetchChapters();
  }, [selectedSubjectId, subjectId]);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create memorization
      const { data: memorization, error: memError } = await supabase
        .from('memorizations')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          creator_id: user.id,
          subject_id: selectedSubjectId || subjectId || null,
          chapter_id: selectedChapterId || chapterId || null,
          class_id: classId,
          is_public: isPublic,
        })
        .select()
        .single();

      if (memError) throw memError;

      // Create flashcards
      const flashcardsToInsert = flashcards.map((card, index) => ({
        memorization_id: memorization.id,
        front_data: card.front_data,
        back_data: card.back_data,
        order_index: index,
      }));

      const { error: cardsError } = await supabase
        .from('flashcards')
        .insert(flashcardsToInsert);

      if (cardsError) throw cardsError;

      // Auto-subscribe creator to their own memorization
      await supabase
        .from('memorization_subscriptions')
        .insert({ user_id: user.id, memorization_id: memorization.id });

      toast.success('Memorization created successfully!');
      onClose();
      setTitle('');
      setDescription('');
      setSelectedSubjectId(null);
      setSelectedChapterId(null);
      setFlashcards([{ front_data: { text: '', media: [] }, back_data: { text: '', media: [] }, order_index: 0 }]);
    } catch (error: any) {
      console.error('Error creating memorization:', error);
      toast.error(error.message || 'Failed to create memorization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>Create Memorization</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            {/* Always show class */}
            {className && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm">
                  <span className="text-muted-foreground">Class: </span>
                  <span className="font-medium">{className}</span>
                </div>
              </div>
            )}

            {/* Show subject selector if no subjectId provided */}
            {!subjectId && subjects.length > 0 && (
              <div>
                <Label htmlFor="subject">Subject (Optional)</Label>
                <Select
                  value={selectedSubjectId?.toString()}
                  onValueChange={(value) => {
                    setSelectedSubjectId(value ? parseInt(value) : null);
                    setSelectedChapterId(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id.toString()}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Show subject name if subjectId provided */}
            {subjectId && subjectName && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm">
                  <span className="text-muted-foreground">Subject: </span>
                  <span className="font-medium">{subjectName}</span>
                </div>
              </div>
            )}

            {/* Show chapter selector if chapters available */}
            {chapters.length > 0 && !chapterId && (
              <div>
                <Label htmlFor="chapter">Chapter (Optional)</Label>
                <Select
                  value={selectedChapterId?.toString()}
                  onValueChange={(value) => setSelectedChapterId(value ? parseInt(value) : null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a chapter" />
                  </SelectTrigger>
                  <SelectContent>
                    {chapters.map((chapter) => (
                      <SelectItem key={chapter.id} value={chapter.id.toString()}>
                        {chapter.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            {loading ? 'Creating...' : 'Create Memorization'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
