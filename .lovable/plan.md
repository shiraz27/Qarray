## Goal

Two small UI fixes to the per-cell editing on the Statistics page:

1. Stop truncating chip lists with `+N`. Show **all** tags for Teachers, Schools, Books, and Types, wrapping onto multiple lines inside the cell.
2. Make the **Types** cell behave like the other per-cell fields (it already uses `MetaCell`, but the editor is a raw "comma-separated ids" input). Replace it with the same multi-select used in the resource form so the user picks types by name with checkboxes — same Confirm/Discard preview flow.

No other behavior changes. Only `src/components/statistics/MetaCell.tsx` is touched.

## Changes to `MetaCell.tsx`

### 1. Remove `+N` truncation

Replace `ChipsDisplay` so it always renders every item, wrapping:

```tsx
function ChipsDisplay({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1 max-w-[280px]">
      {items.map((item, i) => (
        <Badge key={i} variant="secondary" className="text-xs">
          {item}
        </Badge>
      ))}
    </div>
  );
}
```

No `slice(0, 2)`, no `+N` outline badge. The cell grows vertically as needed; the table already supports multi-line rows.

### 2. Native multi-select for the Types preview editor

When `variant === 'typeIds'` and the cell is in preview/edit state, render `ResourceTypeMultiSelect` (already used elsewhere in the project) instead of the current `<Input>` of comma-separated ids.

- Keep internal `draft` state, but for `typeIds` store it as `number[]` directly instead of a comma-separated string.
- On AI suggest: `suggestion` (a `number[]`) becomes the initial `draft`.
- On manual edit: `draft = (value as number[]) ?? []`.
- On confirm: pass `draft` straight to `onSave` — no parsing.
- The "type ids: 1=foo · 2=bar" hint line is removed (the multi-select shows names directly).

Sketch:

```tsx
{variant === 'typeIds' ? (
  <ResourceTypeMultiSelect
    options={resourceTypes ?? []}
    value={(draft as number[]) ?? []}
    onChange={(next) => setDraft(next)}
    placeholder="Select types"
    className="h-auto"
  />
) : variant === 'longText' ? (
  <Textarea ... />
) : (
  <Input ... />
)}
```

To avoid splitting `draft` into two shapes, store it as `unknown` internally: `string | number[] | null`. The other variants continue to use `string`; only `typeIds` uses `number[]`. The branching in `confirm()` becomes:

```ts
let next: CellValue;
if (variant === 'typeIds') next = (draft as number[]) ?? [];
else if (variant === 'array') next = stringToArray(draft as string);
else if (variant === 'number') { ... }
else next = draft as string;
```

`startEdit` / `startSuggest` set `draft` to the appropriate shape per variant.

### What does NOT change

- `Statistics.tsx` wiring stays identical — it already passes `resourceTypes` to the `MetaCell` and uses `variant="typeIds"` for both Resources and Questions type cells.
- Idle/loading/save/confirm/discard logic, suggestion cache, and per-row save helpers are untouched.
- Batch toolbar and `aiRowMenu` are untouched.

## Files touched

- `src/components/statistics/MetaCell.tsx` — `ChipsDisplay` rewrite + typeIds editor swap.

No backend, schema, or other component changes.  
  
also don't forget the description column to add in a similar fashion.