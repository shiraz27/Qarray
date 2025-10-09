import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { User, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface State {
  id: number;
  name: string;
}

interface Institute {
  id: string;
  name: string;
  state_id: number;
}

interface Class {
  id: number;
  name: string;
}

interface EditProfileDialogProps {
  open: boolean;
  onClose: () => void;
  currentFirstName: string;
  currentLastName: string;
  currentAvatarColor: string;
  currentEmail: string;
  currentPhoneNumber: string;
  currentStateId: number | null;
  currentClassId: number | null;
  currentInstituteId: string | null;
  userId: string;
  onUpdate: () => void;
}

const avatarColors = [
  { name: 'Blue', value: 'from-blue-400 to-blue-600' },
  { name: 'Grey', value: 'from-gray-400 to-gray-600' },
  { name: 'Black', value: 'from-gray-700 to-gray-900' },
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
  currentEmail,
  currentPhoneNumber,
  currentStateId,
  currentClassId,
  currentInstituteId,
  userId,
  onUpdate,
}) => {
  const [firstName, setFirstName] = useState(currentFirstName);
  const [lastName, setLastName] = useState(currentLastName);
  const [avatarColor, setAvatarColor] = useState(currentAvatarColor);
  const [email, setEmail] = useState(currentEmail);
  const [phoneNumber, setPhoneNumber] = useState(currentPhoneNumber?.replace('+216', '') || '');
  const [stateId, setStateId] = useState(currentStateId?.toString() || '');
  const [classId, setClassId] = useState(currentClassId?.toString() || '');
  const [instituteId, setInstituteId] = useState(currentInstituteId || '');
  const [loading, setLoading] = useState(false);
  const [states, setStates] = useState<State[]>([]);
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [openInstitute, setOpenInstitute] = useState(false);

  useEffect(() => {
    if (open) {
      fetchStates();
      fetchClasses();
      fetchInstitutes();
    }
  }, [open]);

  useEffect(() => {
    setInstituteId('');
  }, [stateId]);

  const fetchStates = async () => {
    try {
      const { data, error } = await supabase
        .from('states')
        .select('id, name')
        .order('name');
      if (error) throw error;
      setStates(data || []);
    } catch (error) {
      console.error('Error fetching states:', error);
    }
  };

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('hidden', false)
        .order('id');
      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchInstitutes = async () => {
    try {
      const { data, error } = await supabase
        .from('institutes')
        .select('id, name, state_id')
        .order('name');
      if (error) throw error;
      setInstitutes(data || []);
    } catch (error) {
      console.error('Error fetching institutes:', error);
    }
  };

  const filteredInstitutes = stateId 
    ? institutes.filter(institute => institute.state_id === parseInt(stateId))
    : institutes;

  const handleSave = async () => {
    setLoading(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          avatar_color: avatarColor,
          phone_number: `+216${phoneNumber}`,
          state_id: stateId ? parseInt(stateId) : null,
          class_id: classId ? parseInt(classId) : null,
          institute_id: instituteId || null,
        })
        .eq('user_id', userId);

      if (profileError) throw profileError;

      // Handle email change if different
      if (email !== currentEmail) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: email,
        });

        if (emailError) throw emailError;
        
        toast.success('Profile updated! Please check your new email to confirm the change.');
      } else {
        toast.success('Profile updated successfully');
      }
      
      onUpdate();
      onClose();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription className="sr-only">
            Update your profile information including name and avatar color
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
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
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Changing email requires confirmation at the new address
            </p>
          </div>

          <div>
            <Label htmlFor="phone">Phone Number</Label>
            <div className="flex gap-2">
              <Input value="+216" disabled className="w-20" />
              <Input
                id="phone"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="XX XXX XXX"
                maxLength={8}
                className="flex-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="state">Gouvernorat</Label>
            <Select value={stateId} onValueChange={setStateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select gouvernorat" />
              </SelectTrigger>
              <SelectContent>
                {states.map((state) => (
                  <SelectItem key={state.id} value={state.id.toString()}>
                    {state.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="class">Classe</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Select classe" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((classItem) => (
                  <SelectItem key={classItem.id} value={classItem.id.toString()}>
                    {classItem.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="institute">Lycée</Label>
            <Popover open={openInstitute} onOpenChange={setOpenInstitute}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openInstitute}
                  disabled={!stateId}
                  className={cn(
                    "w-full justify-between",
                    !instituteId && "text-muted-foreground"
                  )}
                >
                  {instituteId
                    ? filteredInstitutes.find((institute) => institute.id === instituteId)?.name
                    : stateId
                    ? 'Select lycée'
                    : 'Select gouvernorat first'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search institute..." />
                  <CommandList>
                    <CommandEmpty>No institutes found</CommandEmpty>
                    <CommandGroup>
                      {filteredInstitutes.map((institute) => (
                        <CommandItem
                          key={institute.id}
                          value={institute.name}
                          onSelect={() => {
                            setInstituteId(institute.id);
                            setOpenInstitute(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              instituteId === institute.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {institute.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Avatar Color</Label>
            <div className="grid grid-cols-3 gap-3 mt-2">
              {avatarColors.map((color) => (
                <button
                  key={color.value}
                  type="button"
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
