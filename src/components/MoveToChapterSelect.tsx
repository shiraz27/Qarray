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
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
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

  // Scope filters
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);

  const classNameById = useMemo(() => {
    const m: Record<number, string> = {};
    for (const c of classes) m[c.id] = c.name;
    return m;
  }, [classes]);

  // Load classes on mount so tags can render class names even before opening popover
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

  // Load subjects when class selection changes
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
        .select('id, name, class_id, subjects(name), classes(name)')
        .eq('id', value)
        .maybeSingle();
      if (data) {
        setCurrentLabel({
          id: data.id,
          name: data.name,
          subject_name: data.subjects?.name ?? null,
          class_id: data.class_id,
          class_name: data.classes?.name ?? null,
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
        setResults(Array.from(merged.values()).slice(0, 50));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, open, filterKey]);

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
          <span className="truncate text-left">
            {currentLabel
              ? currentLabel.name
              : value
                ? `Chapter #${value}`
                : 'Pick a destination chapter…'}
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
                      setCurrentLabel({
                        id: c.id,
                        name: c.name,
                        subject_name: c.subject_name ?? null,
                        class_id: c.class_id ?? null,
                        class_name: c.class_id ? classNameById[c.class_id] ?? null : null,
                      });
                      setOpen(false);
                    }}
                    className={cn('flex items-center gap-2', isCurrent && 'bg-muted')}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4',
                        isCurrent ? 'opacity-100' : 'opacity-0',
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

    {value && currentLabel && (
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className="max-w-[12rem] truncate">
          Class:{' '}
          {currentLabel.class_name ??
            (currentLabel.class_id ? classNameById[currentLabel.class_id] : null) ??
            (currentLabel.class_id ? `#${currentLabel.class_id}` : '—')}
        </Badge>
        <Badge variant="outline" className="max-w-[12rem] truncate">
          Subject: {currentLabel.subject_name ?? '—'}
        </Badge>
        <Badge variant="secondary" className="max-w-[12rem] truncate">
          Chapter: {currentLabel.name}
        </Badge>
      </div>
    )}
    </div>
  );
};