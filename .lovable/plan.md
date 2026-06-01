## Goal
Comprehensive English / French / Arabic coverage for every user-facing page, dialog, and form, organized into per-namespace JSON locale files, with French and Arabic produced via Lovable AI (Gemini Flash) and proofread post-hoc.

## Scope (in)
Pages: `Landing`, `Login`, `CompleteProfile`, `Index` (dashboard), `Chapter`, `ResourceDetail`, `QuestionDetail`, `MemorizationDetail`, `Bookmarks`, `Classmates`, `Profile`, `NotFound`, `DeleteBookmark`.
Shared UI: `Header`, `BottomNavigation`, `GlobalSearch`, `NotificationPanel`, `LanguageSwitcher`, `ThemeSwitcher`, `DarkModeToggle`, `TutorialDialog`, `EmptyState`, `StatusBar`, `UploadStatusIndicator`, badges (`Verified`, `AI`, `Teacher`, `Book`, `PageCount`, `ResourceType`, `SharedWith`), `ActionButtons`, `ReportButton`, `MemorizeButton`.
Forms / dialogs: `AddResourceForm*`, `AskQuestionForm*`, `AnswerQuestionForm`, all `Edit*Form` (resource, question, answer, profile), `CreateMemorizationDialog`, `EditMemorizationDialog`, `StudySessionDialog`, `ManageChapterDialog`, `ManageSubjectDialog`, `MoveToChapterSelect`, `ResourceTypeMultiSelect`, `SharedChaptersMultiSelect`, `FlashcardEditor`, autocompletes (`School`, `Book`), `MediaUploader`, `MediaList`, `MediaPreview`, `MediaPreviewDialog`, `PdfInlinePreview`, `AudioPlayer*`, `AiAnswerRenderer` (UI chrome only).
Common UX strings: toast titles/descriptions used inside in-scope components, validation messages, confirmation prompts.

## Scope (out, English only for this pass)
- `Statistics`, `Moderation`, `AdminDeleteTab`, every file under `src/components/statistics/`.
- Edge-function user-facing strings (kept in English; small surface, can be a follow-up).
- Date formatting / pluralization fine-tuning beyond i18next defaults.
- SEO copy in `SEO.tsx` beyond existing translated meta keys.

## Architecture

### File layout
Replace `src/i18n/config.ts`'s embedded `resources` with per-namespace JSON files:

```text
src/i18n/
  config.ts            # registers namespaces, sets defaultNS = 'common'
  locales/
    en/
      common.json      # buttons, statuses, generic toasts ("Save", "Cancel", "Error", "Loading...")
      auth.json        # Login, CompleteProfile
      nav.json         # Header, BottomNavigation, LanguageSwitcher
      landing.json     # Landing page
      dashboard.json   # Index page
      profile.json     # Profile page, EditProfileDialog
      chapter.json     # Chapter page
      resource.json    # ResourceDetail + resource forms
      question.json    # QuestionDetail + ask/answer forms
      memorization.json# Memorization pages, dialogs, flashcards
      bookmarks.json   # Bookmarks, DeleteBookmark
      classmates.json  # Classmates
      forms.json       # Shared form labels, autocompletes, validation
      media.json       # Uploaders, players, previews
      dialogs.json     # Tutorial, confirmations, report, manage chapter/subject
      errors.json      # NotFound, toast error templates
    fr/...             # same file set
    ar/...             # same file set
```

### Loader
`config.ts` keeps `initReactI18next` and adds:
- Static `import en_common from './locales/en/common.json'` (etc.) bundled at build time — no dynamic backend needed, keeps current SPA model.
- `resources` built from those imports, one entry per namespace per language.
- `defaultNS: 'common'`, `fallbackNS: 'common'`, `fallbackLng: 'en'`.

### Migration of existing keys
Every key currently in `config.ts` is preserved under the most appropriate namespace; existing call sites already use `t('key')` so they continue to work because the migrated key lands in `common`. Only NEW keys get explicit namespace calls (e.g. `useTranslation('resource')`).

## Implementation steps

1. **Inventory & extract** (`scripts/i18n-extract.mjs`, runs locally, not shipped): walks in-scope files, finds JSX text and string literals in `toast({title, description})`, `placeholder=`, `aria-label=`, `<Button>...</Button>`, etc. Produces a draft `src/i18n/locales/en/<namespace>.json` per file group. Manual review pass to dedupe and pick keys.
2. **Refactor each in-scope file** to use `useTranslation('<namespace>')` and replace hardcoded strings with `t('key')`. Keep keys short and dotted (`hero.title`, `actions.save`). Reuse `common.*` for buttons/toasts.
3. **Generate French + Arabic JSONs** via `scripts/i18n-translate.mjs`:
   - For each en/*.json, call Lovable AI Gateway (`google/gemini-2.5-flash`, structured output) with the JSON object plus instructions: "Translate values to {targetLang}; keep keys, placeholders like {{name}}, HTML tags, and product names (Qarray.TN, Lovable AI, etc.) unchanged. Return JSON with identical shape."
   - Write to `fr/*.json` and `ar/*.json`.
   - One file at a time, with progress logging; rerun only on missing files via a `--missing-only` flag.
4. **Hook RTL formatting**: extend `LanguageSwitcher`'s `changeLanguage` (already sets `dir=rtl`) to also persist choice in `localStorage` so the language survives reload; load it in `config.ts` `lng:` resolution.
5. **QA pass**: run a script that walks every JSON file and asserts every key in `en/*.json` exists in `fr/*.json` and `ar/*.json`; print missing keys.
6. **Manual spot-check** on Landing, Login, Dashboard, ResourceDetail, QuestionDetail in all three languages (switch via header).

## Out of scope / non-goals
- No new UI for translators.
- No CMS, Crowdin, or external translation service.
- No RTL-specific layout tweaks beyond the `dir` attribute already set; if existing layouts break in Arabic, that's a follow-up.

## Risk & cost notes
- Roughly 40–50 files to refactor; this is a large mechanical edit. I'll batch by namespace (auth → nav → landing → dashboard → forms → resource → question → memorization → bookmarks → media → dialogs → errors).
- AI translation cost: ~15 JSON files × 2 languages = 30 model calls. Trivial.
- Arabic output should be reviewed by a fluent speaker before launch; the plan flags this in code comments and the QA step.

## Deliverables
- New `src/i18n/locales/{en,fr,ar}/*.json` files (15 namespaces × 3 langs = 45 files).
- Updated `src/i18n/config.ts`.
- Refactored in-scope pages/components using `useTranslation(ns)`.
- `scripts/i18n-translate.mjs` and `scripts/i18n-check.mjs` (kept in repo for future strings).
- Short README at `src/i18n/README.md` explaining how to add a new key and rerun translation.
