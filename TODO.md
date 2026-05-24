## Qarray - Tasks

- [x] (SUBJECTS+CHAPTERS GLOBAL STATE) Find where subjects/chapters are fetched and why subject click causes a refetch/refresh.
  - [x] Search repo for chapters loading (`from('chapters')`, `chapters_rows`, etc.)
  - [x] Read relevant files (SubjectTabs + MainContent) to understand current behavior.
  - [x] Brainstorm and confirm the comprehensive edit plan.
  - [x] Implement a global context/store to preload and reuse subjects/chapters.
  - [x] Refactor `SubjectTabs` and `MainContent` to use the global state.
  - [x] Ensure refetch happens only on explicit mutations (add/edit/delete) or when cache is missing/stale.
  - [ ] Run typecheck/lint and quick manual test (click subjects, verify fewer/no redundant network calls).

