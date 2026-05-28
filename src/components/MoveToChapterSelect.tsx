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
} from '@/components/ui/command';
import { ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChapterOption {
  id: number;
  name: string;
  subject_name?: string | null;
  class_id?: number | null;
}

interface Props {
  value: number | null;
  onChange: (id: number) => void;
  excludeChapterId?: number;
  disabled?: boolean;
}

export const MoveToChapterSelect: React.FC<Props> = ({
  value,
  onChange,
  excludeChapterId,
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ChapterOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentLabel, setCurrentLabel] = useState<ChapterOption | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Hydrate label for current value
  useEffect(() => {
    if (!value) {
      setCurrentLabel(null);
      return;
    }
    if (currentLabel?.id === value) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('chapters')
        .select('id, name, class_id, subjects(name)')
        .eq('id', value)
        .maybeSingle();
      if (data) {
        setCurrentLabel({
          id: data.id,
          name: data.name,
          subject_name: data.subjects?.name ?? null,
          class_id: data.class_id,
        });
      }
    })();
  }, [value]);

  // Search chapters
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await (supabase as any).rpc('search_chapters_normalized', {
          search_query: search || '',
          p_class_id: null,
          p_subject_id: null,
        });
        const list: ChapterOption[] = ((data as any[]) || []).map((r) => ({
          id: r.id,
          name: r.name,
          subject_name: r.subject_name ?? null,
          class_id: r.class_id,
        }));
        setResults(list);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="w-full justify-between"
          disabled={disabled}
        >
          <span className="truncate text-left">
            {currentLabel
              ? `${currentLabel.name}${currentLabel.subject_name ? ` · ${currentLabel.subject_name}` : ''}`
              : value
                ? `Chapter #${value}`
                : 'Pick a destination chapter…'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type a chapter name…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Searching…
              </div>
            )}
            {!loading && results.length === 0 && (
              <CommandEmpty>No chapters found.</CommandEmpty>
            )}
            <CommandGroup>
              {results.map((c) => {
                const isSelf = excludeChapterId === c.id;
                const isCurrent = value === c.id;
                return (
                  <CommandItem
                    key={c.id}
                    value={String(c.id)}
                    disabled={isSelf}
                    onSelect={() => {
                      if (isSelf) return;
                      onChange(c.id);
                      setOpen(false);
                    }}
                    className={cn('flex items-center gap-2', isCurrent && 'bg-muted')}
                  >
                    <div className="flex flex-col text-left">
                      <span className="text-sm">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.subject_name ?? ''}
                        {isSelf ? ' (current chapter)' : ''}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};