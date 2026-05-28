import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  class_name?: string | null;
}

interface ClassOption { id: number; name: string }
interface SubjectOption { id: number; name: string; class_id: number | null }

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

  // Scope filters
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);

  // Load classes on mount so tags can render class names without opening popover
  useEffect(() => {
    if (classes.length > 0) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('classes')
        .select('id, name, hidden')
        .eq('hidden', false)
        .order('id');
      setClasses(((data as any[]) || []).map((c) => ({ id: c.id, name: c.name })));
    })();
  }, []);

  const classNameById = useMemo(() => {
    const m: Record<number, string> = {};
    for (const c of classes) m[c.id] = c.name;
    return m;
  }, [classes]);

  // Load subjects whenever class selection changes
  useEffect(() => {
    if (!open) return;
    if (selectedClassIds.length === 0) {
      setSubjects([]);
      setSelectedSubjectIds([]);
      return;
    }
    (async () => {
      const { data } = await (supabase as any)
        .from('subjects')
        .select('id, name, class_id, deleted')
        .in('class_id', selectedClassIds)
        .eq('deleted', false)
        .order('name');
      const list = ((data as any[]) || []).map((s) => ({
        id: s.id,
        name: s.name,
        class_id: s.class_id,
      }));
      setSubjects(list);
      // Drop subject ids no longer in scope
      setSelectedSubjectIds((prev) => prev.filter((id) => list.some((s) => s.id === id)));
    })();
  }, [selectedClassIds, open]);

  const filterKey = useMemo(
    () =>
      `${selectedClassIds.slice().sort().join(',')}|${selectedSubjectIds
        .slice()
        .sort()
        .join(',')}`,
    [selectedClassIds, selectedSubjectIds],
  );

  // Hydrate names for already-selected ids
  useEffect(() => {
    const missing = value.filter((id) => !selectedDetails[id]);
    if (missing.length === 0) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('chapters')
        .select('id, name, subject_id, class_id, subjects(name), classes(name)')
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
              class_name: c.classes?.name ?? null,
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
        // Determine which (class_id, subject_id) pairs to query.
        // Multi-select is collapsed into N single-id RPC calls then merged.
        type Pair = { class_id: number | null; subject_id: number | null };
        let pairs: Pair[] = [];
        if (selectedSubjectIds.length > 0) {
          pairs = selectedSubjectIds.map((sid) => ({ class_id: null, subject_id: sid }));
        } else if (selectedClassIds.length > 0) {
          pairs = selectedClassIds.map((cid) => ({ class_id: cid, subject_id: null }));
        } else {
          pairs = [{ class_id: null, subject_id: null }];
        }

        const responses = await Promise.all(
          pairs.map((p) =>
            (supabase as any).rpc('search_chapters_normalized', {
              search_query: search || '',
              p_class_id: p.class_id,
              p_subject_id: p.subject_id,
            }),
          ),
        );

        const merged = new Map<number, ChapterOption>();
        for (const { data } of responses as any[]) {
          for (const r of (data || []) as any[]) {
            if (!merged.has(r.id)) {
              merged.set(r.id, {
                id: r.id,
                name: r.name,
                subject_name: r.subject_name ?? null,
                class_id: r.class_id,
              });
            }
          }
        }
        const list: ChapterOption[] = Array.from(merged.values()).slice(0, 50);
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
  }, [search, open, filterKey]);

  const toggle = (id: number) => {
    if (excludeChapterId && id === excludeChapterId) return;
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  const toggleClass = (id: number) =>
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  const toggleSubject = (id: number) =>
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );

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
          <div className="border-b p-2 space-y-2 max-h-64 overflow-y-auto">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                Classes
              </div>
              <div className="flex flex-wrap gap-1">
                {classes.length === 0 && (
                  <span className="text-xs text-muted-foreground">Loading…</span>
                )}
                {classes.map((c) => {
                  const on = selectedClassIds.includes(c.id);
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => toggleClass(c.id)}
                      className={cn(
                        'text-[11px] px-2 py-0.5 rounded-full border transition',
                        on
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-border hover:bg-muted',
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                Subjects
              </div>
              {selectedClassIds.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Pick a class to filter by subject.
                </span>
              ) : subjects.length === 0 ? (
                <span className="text-xs text-muted-foreground">No subjects.</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {subjects.map((s) => {
                    const on = selectedSubjectIds.includes(s.id);
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => toggleSubject(s.id)}
                        className={cn(
                          'text-[11px] px-2 py-0.5 rounded-full border transition',
                          on
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-foreground border-border hover:bg-muted',
                        )}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {(selectedClassIds.length > 0 || selectedSubjectIds.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedClassIds([]);
                  setSelectedSubjectIds([]);
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline"
              >
                Clear filters
              </button>
            )}
          </div>
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
        <div className="flex flex-col gap-1.5">
          {value.map((id) => {
            const d = selectedDetails[id];
            const className =
              d?.class_name ??
              (d?.class_id ? classNameById[d.class_id] : null) ??
              (d?.class_id ? `#${d.class_id}` : '—');
            return (
              <div key={id} className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="max-w-[12rem] truncate">
                  Class: {className}
                </Badge>
                <Badge variant="outline" className="max-w-[12rem] truncate">
                  Subject: {d?.subject_name ?? '—'}
                </Badge>
                <Badge variant="secondary" className="max-w-[12rem] truncate gap-1 pr-1">
                  <span className="truncate">Chapter: {d?.name ?? `#${id}`}</span>
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="rounded hover:bg-muted p-0.5"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};