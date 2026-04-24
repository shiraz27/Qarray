import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Check, ChevronsUpDown, Plus, Building2, Bot, Loader2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Institute {
  id: string;
  name: string;
  verified: boolean;
}

interface SchoolAutocompleteProps {
  value: string;
  onChange: (value: string, instituteId?: string) => void;
  aiSuggested?: string | null;
  placeholder?: string;
  disabled?: boolean;
}

export const SchoolAutocomplete: React.FC<SchoolAutocompleteProps> = ({
  value,
  onChange,
  aiSuggested,
  placeholder = "Search or add school...",
  disabled = false
}) => {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedInstituteId, setSelectedInstituteId] = useState<string | undefined>();
  const [isAddingNew, setIsAddingNew] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // When opening, pre-fill the search input with the current value so the user
  // can immediately edit it instead of having to retype from scratch.
  useEffect(() => {
    if (open) {
      setSearchValue(value || '');
    }
  }, [open]);

  // Search institutes when search value changes
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!searchValue || searchValue.length < 1) {
      setInstitutes([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('institutes')
          .select('id, name, verified')
          .ilike('name', `%${searchValue}%`)
          .limit(10);

        if (error) {
          console.error('Error searching institutes:', error);
          return;
        }

        setInstitutes(data || []);
      } catch (error) {
        console.error('Error in institute search:', error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchValue]);

  // Auto-match AI suggestion with existing institutes
  useEffect(() => {
    if (aiSuggested && !selectedInstituteId) {
      const matchInstitutes = async () => {
        const { data } = await supabase
          .from('institutes')
          .select('id, name, verified')
          .ilike('name', `%${aiSuggested}%`)
          .limit(5);

        if (data && data.length > 0) {
          // Find exact or close match
          const exactMatch = data.find(
            inst => inst.name.toLowerCase() === aiSuggested.toLowerCase()
          );
          if (exactMatch) {
            setSelectedInstituteId(exactMatch.id);
            onChange(exactMatch.name, exactMatch.id);
          }
        }
      };
      matchInstitutes();
    }
  }, [aiSuggested]);

  const handleSelect = (institute: Institute) => {
    setSelectedInstituteId(institute.id);
    onChange(institute.name, institute.id);
    setOpen(false);
    setSearchValue('');
  };

  // Use the typed text as a free-form school name without creating a new
  // institute record. This lets the user override AI suggestions with any
  // string they want.
  const handleUseExact = () => {
    const nameToUse = searchValue.trim();
    if (!nameToUse) return;
    setSelectedInstituteId(undefined);
    onChange(nameToUse, undefined);
    setOpen(false);
    setSearchValue('');
  };

  const handleAddNew = async () => {
    const nameToAdd = searchValue || value;
    if (!nameToAdd) return;

    setIsAddingNew(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('User not authenticated');
        return;
      }

      const { data, error } = await supabase
        .from('institutes')
        .insert({
          name: nameToAdd,
          added_by: user.id,
          verified: false
        })
        .select('id, name, verified')
        .single();

      if (error) {
        console.error('Error adding institute:', error);
        return;
      }

      if (data) {
        setSelectedInstituteId(data.id);
        onChange(data.name, data.id);
        setOpen(false);
        setSearchValue('');
      }
    } catch (error) {
      console.error('Error in handleAddNew:', error);
    } finally {
      setIsAddingNew(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedInstituteId(undefined);
    onChange('', undefined);
    setSearchValue('');
  };

  const showAiBadge = aiSuggested && value === aiSuggested;
  const trimmedSearch = searchValue.trim();
  const exactMatchInList = institutes.some(
    (i) => i.name.toLowerCase() === trimmedSearch.toLowerCase()
  );
  const differsFromCurrent = trimmedSearch && trimmedSearch !== value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <div className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 shrink-0 opacity-50" />
            <span className="truncate">{value || placeholder}</span>
          </div>
          <div className="flex items-center gap-1">
            {showAiBadge && (
              <Badge variant="secondary" className="text-xs px-1 py-0">
                <Bot className="h-3 w-3 mr-0.5" />
                AI
              </Badge>
            )}
            {selectedInstituteId && (
              <Badge variant="outline" className="text-xs px-1 py-0 text-green-600">
                <Check className="h-3 w-3" />
              </Badge>
            )}
            <Pencil className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search schools..." 
            value={searchValue}
            onValueChange={setSearchValue}
            autoFocus
          />
          <CommandList>
            {value && (
              <CommandGroup>
                <CommandItem
                  onSelect={handleClearSelection}
                  className="cursor-pointer text-muted-foreground text-xs"
                >
                  Clear current value
                </CommandItem>
              </CommandGroup>
            )}

            {loading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
            
            {!loading && searchValue.length >= 1 && institutes.length === 0 && (
              <CommandEmpty>
                <div className="py-2 text-sm text-muted-foreground">
                  No schools found
                </div>
              </CommandEmpty>
            )}

            {institutes.length > 0 && (
              <CommandGroup heading="Schools">
                {institutes.map((institute) => (
                  <CommandItem
                    key={institute.id}
                    value={institute.id}
                    onSelect={() => handleSelect(institute)}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedInstituteId === institute.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex items-center gap-2 flex-1">
                      <span>{institute.name}</span>
                      {institute.verified && (
                        <Badge variant="secondary" className="text-xs">Verified</Badge>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {trimmedSearch.length >= 1 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  {differsFromCurrent && (
                    <CommandItem
                      onSelect={handleUseExact}
                      className="cursor-pointer"
                    >
                      <Check className="mr-2 h-4 w-4" />
                      <span>Use exact name: "{trimmedSearch}"</span>
                    </CommandItem>
                  )}
                  {!exactMatchInList && (
                  <CommandItem
                    onSelect={handleAddNew}
                    className="cursor-pointer"
                    disabled={isAddingNew}
                  >
                    {isAddingNew ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    <span>Add "{trimmedSearch}" as new school</span>
                  </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}

          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
