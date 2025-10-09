import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { User } from 'lucide-react';

interface EditProfileDialogProps {
  open: boolean;
  onClose: () => void;
  currentFirstName: string;
  currentLastName: string;
  currentAvatarColor: string;
  userId: string;
  onUpdate: () => void;
}

const avatarColors = [
  { name: 'Blue', value: 'from-blue-400 to-blue-600' },
  { name: 'Purple', value: 'from-purple-400 to-purple-600' },
  { name: 'Pink', value: 'from-pink-400 to-pink-600' },
  { name: 'Green', value: 'from-green-400 to-green-600' },
  { name: 'Orange', value: 'from-orange-400 to-orange-600' },
  { name: 'Red', value: 'from-red-400 to-red-600' },
  { name: 'Primary', value: 'gradient-primary' },
  { name: 'Secondary', value: 'gradient-secondary' },
  { name: 'Accent', value: 'gradient-accent' },
];

export const EditProfileDialog: React.FC<EditProfileDialogProps> = ({
  open,
  onClose,
  currentFirstName,
  currentLastName,
  currentAvatarColor,
  userId,
  onUpdate,
}) => {
  const [firstName, setFirstName] = useState(currentFirstName);
  const [lastName, setLastName] = useState(currentLastName);
  const [avatarColor, setAvatarColor] = useState(currentAvatarColor);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          avatar_color: avatarColor,
        })
        .eq('user_id', userId);

      if (error) throw error;

      toast.success('Profile updated successfully');
      onUpdate();
      onClose();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Enter first name"
            />
          </div>

          <div>
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Enter last name"
            />
          </div>

          <div>
            <Label>Avatar Color</Label>
            <div className="grid grid-cols-3 gap-3 mt-2">
              {avatarColors.map((color) => (
                <button
                  key={color.value}
                  onClick={() => setAvatarColor(color.value)}
                  className={`relative h-16 rounded-lg bg-gradient-to-br ${color.value} hover-scale ${
                    avatarColor === color.value ? 'ring-2 ring-primary ring-offset-2' : ''
                  }`}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <User className="w-6 h-6 text-white" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
