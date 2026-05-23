import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChapterOption {
  id: number;
  name: string;
  subject_name?: string | null;
  class_id?: number | null;
}

interface Props {
  value: number[];
  onChange: (next: number[]) => void;
  excludeChapterId?: number;
  disabled?: boolean;
}

export const SharedChaptersMultiSelect: React.FC<Props> = ({
  value,
  onChange,
  excludeChapterId,
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ChapterOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<Record<number, ChapterOption>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Hydrate names for already-selected ids
  useEffect(() => {
    const missing = value.filter((id) => !selectedDetails[id]);
    if (missing.length === 0) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('chapters')
        .select('id, name, subject_id, class_id, subjects(name)')
        .in('id', missing);
      if (data) {
        setSelectedDetails((prev) => {
          const next = { ...prev };
          for (const c of data as any[]) {
            next[c.id] = {
              id: c.id,
              name: c.name,
              subject_name: c.subjects?.name ?? null,
              class_id: c.class_id,
            };
          }
          return next;
        });
      }
    })();
  }, [value]);

  // Search
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await (supabase as any).rpc('search_chapters_normalized', {
          search_query: search || '',
        });
        const list: ChapterOption[] = (data || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          subject_name: r.subject_name ?? null,
          class_id: r.class_id,
        }));
        setResults(list);
        setSelectedDetails((prev) => {
          const next = { ...prev };
          for (const c of list) if (!next[c.id]) next[c.id] = c;
          return next;
        });
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, open]);

  const toggle = (id: number) => {
    if (excludeChapterId && id === excludeChapterId) return;
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="w-full justify-between"
            disabled={disabled}
          >
            <span className="truncate">
              {value.length === 0
                ? 'Search chapters to share with…'
                : `${value.length} chapter${value.length > 1 ? 's' : ''} selected`}
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
                  const isSelected = value.includes(c.id);
                  const isSelf = excludeChapterId === c.id;
                  return (
                    <CommandItem
                      key={c.id}
                      value={String(c.id)}
                      disabled={isSelf}
                      onSelect={() => toggle(c.id)}
                      className="flex items-center gap-2"
                    >
                      <Check
                        className={cn(
                          'h-4 w-4',
                          isSelected ? 'opacity-100' : 'opacity-0',
                        )}
                      />
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

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const d = selectedDetails[id];
            return (
              <Badge key={id} variant="secondary" className="gap-1 pr-1">
                <span className="truncate max-w-[16rem]">
                  {d?.name ?? `Chapter #${id}`}
                  {d?.subject_name ? ` · ${d.subject_name}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="rounded hover:bg-muted p-0.5"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
};