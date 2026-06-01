# i18n / Translations

Locale resources live under `src/i18n/locales/<lang>/<namespace>.json` and are
loaded eagerly via `import.meta.glob` in `src/i18n/config.ts`. Supported
languages: **en** (source of truth), **fr**, **ar**.

## Namespaces

| Namespace | Used by |
|---|---|
| `common` | default; generic buttons, statuses, toasts, nav labels (legacy keys live here) |
| `auth` | Login, password-reset dialogs, CompleteProfile |
| `nav` | Header, BottomNavigation, LanguageSwitcher |
| `landing` | Landing page |
| `dashboard` | Index page |
| `profile` | Profile page + Edit Profile dialog |
| `chapter` | Chapter page |
| `resource` | ResourceDetail + resource forms |
| `question` | QuestionDetail + ask/answer forms |
| `memorization` | Memorization pages, dialogs, flashcards |
| `bookmarks` | Bookmarks / DeleteBookmark |
| `classmates` | Classmates |
| `forms` | Shared form labels, attachments, autocompletes, validation toasts |
| `media` | Uploaders, players, previews |
| `dialogs` | Tutorial, confirmations, report, manage chapter/subject |
| `errors` | NotFound, generic error templates |

## Adding a new translatable string

1. Add the key to the appropriate `src/i18n/locales/en/<ns>.json` file.
2. Use it in the component:
   ```tsx
   import { useTranslation } from 'react-i18next';
   const { t } = useTranslation('landing'); // pick the namespace
   <h1>{t('hero.title')}</h1>
   ```
   For variables, use `{{name}}` placeholders. Avoid the name `count` unless
   you actually want i18next pluralization — use `value` or another name.
3. Generate French + Arabic:
   ```bash
   node scripts/i18n-translate.mjs              # only missing keys
   node scripts/i18n-translate.mjs --only=landing.json
   node scripts/i18n-translate.mjs --force      # overwrite all
   ```
   Requires `LOVABLE_API_KEY` in the environment.
4. Verify parity:
   ```bash
   node scripts/i18n-check.mjs
   ```

## RTL

The `LanguageSwitcher` sets `document.documentElement.dir = 'rtl'` when
Arabic is selected. The choice is persisted in `localStorage` under
`qarray.lng` and restored on the next load.

## Status (initial pass)

Fully migrated to namespaced keys: `Landing`, `Login`, `Profile`,
`AskQuestionForm`, `AnswerQuestionForm`, `EditAnswerForm`.

The following user-facing files still contain hardcoded English strings and
should be migrated incrementally using the pattern above. Each entry shows
the rough number of strings remaining (from the audit):

```
src/pages/ResourceDetail.tsx           ~26
src/components/AddResourceGlobalForm   ~22
src/components/AddResourceForm         ~17
src/pages/QuestionDetail.tsx           ~16
src/components/EditProfileDialog       ~15
src/components/PdfInlinePreview        ~14
src/components/AddResourceFormWithSel  ~12
src/components/EditResourceForm        ~11
src/components/ManageSubjectDialog     ~11
src/components/ReportButton             ~9
src/components/EditMemorizationDialog   ~9
src/pages/CompleteProfile.tsx           ~8 (mostly already using t())
src/components/MediaPreview             ~8
src/components/AskQuestionGlobalForm    ~6
src/components/SharedWithBadge          ~5
src/components/AskQuestionFormWithSel   ~5
src/components/SubjectTabs              ~5
src/components/ActionButtons            ~4
src/components/EditQuestionForm        ~4
src/components/MoveToChapterSelect      ~4
src/components/SharedChaptersMultiSel   ~4
src/components/MediaUploader            ~4
src/components/MemorizationsModal       ~4
src/components/AnswerQuestionForm.tsx   migrated
…
```

For each file: extract the hardcoded strings, add keys to the matching
namespace JSON, replace the literals with `t('key')`, then re-run
`scripts/i18n-translate.mjs` and `scripts/i18n-check.mjs`.
