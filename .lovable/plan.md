# Improve book matching in Global Search

Two scoped changes to `src/components/GlobalSearch.tsx`. No DB changes (book is already searched in all four RPCs).

## 1. Detect `matchType: 'book'`

Currently when a result matches only via `book` (not title/description/OCR text), the result still labels itself as `'description'`. Update result construction so the label is accurate:

- For resources (line ~249): compute `bookMatch = r.book && normalizeText(r.book).includes(normQuery)` and `titleMatch`/`descMatch` similarly. Set `matchType = titleMatch ? 'title' : descMatch ? 'description' : bookMatch ? 'book' : 'description'`. Add `'book'` to the `matchType` union in `SearchResult`.
- For questions (line ~329): if the question `data` doesn't contain `normQuery` but `q.book` does, set `matchType: 'book'`.

In the result card rendering (~line 730), when `matchType === 'book'`, show a small "Matched in book" hint next to the existing `BookBadge` so the user sees why it matched.

## 2. Dedicated book input with autocomplete

Add a separate **Book** filter input next to the existing Subject/Chapter selects (above the results list). It:

- Uses the existing `BookAutocomplete` component (`source="resource"`).
- Stored in new state `bookFilter: string` (default `''`).
- When non-empty, the search constrains results to rows whose `book` ILIKE-matches `bookFilter` — implemented client-side after the RPC results return (filter `resourcesMap` and `questionsMap` by `r.book`/`q.book` containing the normalized `bookFilter`). No new RPC needed.
- A small "Clear" affordance (the existing `BookAutocomplete` already exposes "Clear current value").
- The `bookFilter` is also passed as the `query` to the RPC when the main search box is empty AND a book is chosen, so the user can browse purely by book without typing a query. Implementation: if `query.length < 2` but `bookFilter.length >= 1`, run the searches with `search_query = bookFilter` and skip OCR-content searches (they'd be noisy).

## Technical notes

- `SearchResult.matchType` becomes `'title' | 'description' | 'content' | 'book'`.
- New state: `const [bookFilter, setBookFilter] = useState('');` reset alongside other filters.
- Place the `BookAutocomplete` in the filter row used by Subject/Chapter selects; on mobile it stacks the same way.
- No migrations; the existing `search_resource_books_normalized` and `search_question_books_normalized` RPCs power the autocomplete suggestions.

## Out of scope

- No new dedicated "Books" tab in the result list.
- No ranking/score changes — results still ordered by `id DESC` from the RPCs.
