import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { BookOpen, Check, ChevronsUpDown, Loader2, Pencil, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  source: 'resource' | 'question';
  placeholder?: string;
  disabled?: boolean;
}

export const BookAutocomplete: React.FC<BookAutocompleteProps> = ({
  value,
  onChange,
  source,
  placeholder = '📘 e.g. CMS / CLS / Manuel scolaire',
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [books, setBooks] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) setSearchValue(value || '');
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const rpc =
          source === 'resource'
            ? 'search_resource_books_normalized'
            : 'search_question_books_normalized';
        const { data, error } = await supabase.rpc(rpc as any, {
          search_query: searchValue || '',
        });
        if (error) {
          console.error('Error searching books:', error);
          return;
        }
        setBooks(((data as any[]) || []).map((d) => d.book).filter(Boolean));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchValue, source]);

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    setSearchValue('');
  };

  const handleClear = () => {
    onChange('');
    setSearchValue('');
  };

  const trimmed = searchValue.trim();
  const exactMatch = books.some((b) => b.toLowerCase() === trimmed.toLowerCase());
  const differsFromCurrent = trimmed && trimmed !== value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground'
          )}
          disabled={disabled}
        >
          <div className="flex items-center gap-2 truncate">
            <BookOpen className="h-4 w-4 shrink-0 opacity-50" />
            <span className="truncate">{value || placeholder}</span>
          </div>
          <div className="flex items-center gap-1">
            <Pencil className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type a book name..."
            value={searchValue}
            onValueChange={setSearchValue}
            autoFocus
          />
          <CommandList>
            {value && (
              <CommandGroup>
                <CommandItem
                  onSelect={handleClear}
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

            {!loading && books.length === 0 && trimmed.length === 0 && (
              <CommandEmpty>
                <div className="py-2 text-sm text-muted-foreground">
                  Start typing to search books
                </div>
              </CommandEmpty>
            )}

            {books.length > 0 && (
              <CommandGroup heading="Books">
                {books.map((name) => (
                  <CommandItem
                    key={name}
                    value={name}
                    onSelect={() => handleSelect(name)}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === name ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span>{name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {trimmed.length >= 1 && !exactMatch && differsFromCurrent && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => handleSelect(trimmed)}
                    className="cursor-pointer"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    <span>Use "{trimmed}"</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
