## Add "Chapitre général" to every subject

Currently there are 39 active subjects across 6 classes, and no chapter named "Chapitre général" exists yet.

### What I'll do

Run a single data insert (via the insert tool) that creates one chapter per active subject:

```sql
INSERT INTO chapters (name, subject_id, class_id, verified, deleted)
SELECT 'Chapitre général', s.id, s.class_id, true, false
FROM subjects s
WHERE s.deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM chapters c
    WHERE c.subject_id = s.id
      AND lower(c.name) = 'chapitre général'
  );
```

This will create ~39 new chapters (one per `(subject_id, class_id)`), marked `verified=true`, `deleted=false`. The `NOT EXISTS` guard makes the operation idempotent — re-running it won't create duplicates, and any subjects later added can be backfilled by running it again.

### Notes

- No schema change, no migration, no code change required — these chapters will appear automatically anywhere chapters are listed (Chapter pages, AddResource selection, GlobalSearch, etc.).
- If you'd later want this chapter to sort first in the UI, that would be a separate UI change (currently chapters are ordered by id desc / insertion order in most places). Let me know if you want that too.
