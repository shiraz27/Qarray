# Qarray

<div align="center">
  <img src="./public/favicon.ico" alt="Qarray" width="72" height="72" />
  <h3 style="margin:8px 0 0;">Collaborative e-learning for students</h3>
</div>

---

## Project info

**URL**: https://lovable.dev/projects/45c4dfaa-6db5-4092-9436-f8777e28e70b


## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/45c4dfaa-6db5-4092-9436-f8777e28e70b) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/45c4dfaa-6db5-4092-9436-f8777e28e70b) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

---

## Qarray Codebase Map (Architecture Snapshot)

<div style="background:#0b1220; border:1px solid rgba(255,255,255,.08); border-radius:14px; padding:16px 18px;">

### 1) What Qarray is (product modules)
Qarray is a collaborative **e-learning platform** for students, built around:
- **Chapters**: containers for learning content.
- **Questions & Resources**: collaborative items inside a chapter.
- **Voting + Bookmarks**: lightweight social proof & personal saving.
- **Uploads & OCR/metadata pipeline**: extracting content/media from user PDFs/media.
- **Memorization (spaced repetition)**: scheduling flashcard reviews.
- **Moderation & Statistics**: teacher/admin tooling and dashboards.

### 2) Frontend stack
- **Vite + React + TypeScript**
- **Tailwind CSS** for styling
- **shadcn/ui** for component primitives
- **react-router-dom** for navigation
- **@tanstack/react-query** for data/cache patterns
- **i18next** for translations

### 3) App entry, providers, and routes
**Entry:**
- `src/main.tsx` → mounts `<App />`

**Global wiring + routing:**
- `src/App.tsx`
  - providers: `ThemeProvider`, `I18nextProvider`, `HelmetProvider`, `QueryClientProvider`, `UploadManagerProvider`, toast layers
  - routes:
    - `/` → `Landing`
    - `/dashboard` → `Index`
    - `/login` → `Login`
    - `/complete-profile` → `CompleteProfile`
    - `/bookmarks` → `Bookmarks`
    - `/classmates` → `Classmates`
    - `/chapter/:id` → `Chapter`
    - `/question/:id` → `QuestionDetail`
    - `/resource/:id` → `ResourceDetail`
    - `/profile` → `Profile`
    - `/moderation` → `Moderation`
    - `/statistics` → `Statistics`
    - `/delete-bookmark` → `DeleteBookmark`
    - `/memorization/:id` → `MemorizationDetail`
    - `*` → `NotFound`

### 4) Supabase integration + auth/session
- Supabase client:
  - `src/integrations/supabase/client.ts`
  - uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`
- Example session gating:
  - `src/pages/Index.tsx`
    - listens to `supabase.auth.onAuthStateChange`
    - loads current session via `supabase.auth.getSession()`
    - fetches from `profiles`
    - redirects users to `/complete-profile` if required profile fields are missing
    - can show `TutorialDialog` based on `tutorial_completed`

### 5) Core learning flow: Chapter → Questions/Resources
**Central page:**
- `src/pages/Chapter.tsx`

**Data responsibilities (high level):**
- Fetch chapter row + subject/class context
- Compute counters:
  - question count
  - answer count
  - resource count
  - total pages + pending pages (aggregating `page_count` from `questions` + `resources`)
- Fetch filter metadata:
  - `resource_types`
  - `devoir_types`
- Fetch lists:
  - `questions` + associated `votes` counts + user vote + user bookmark state
  - `resources` + associated `votes` counts + user vote + user bookmark state

**Collaboration features:**
- Add dialogs:
  - `AskQuestionForm`
  - `AddResourceForm`
- Interactions:
  - upvote/downvote via `votes`
  - save/un-save via `bookmarks`
  - media indicators derived from stored text via `extractMediaFromText`

### 6) Memorization & spaced repetition
- SM-2 scheduling implementation:
  - `src/hooks/useSpacedRepetition.ts`
  - includes `calculateNextReview(quality, easeFactor, interval, reviewCount)`
- Due review counting:
  - queries `flashcard_reviews` using `memorization_id` and `next_review_date`

### 7) Upload / OCR pipeline (where to look)
Upload and OCR logic is implemented across:
- Components:
  - `src/components/MediaUploader.tsx`
  - `src/components/PdfInlinePreview.tsx`
  - `src/components/AudioPlayer*.tsx`
- Utilities:
  - `src/utils/documentScanner.ts`
  - `src/utils/ocrAndExtract.ts`
  - `src/utils/metadataExtractor.ts`
  - `src/utils/pdfOcrHelpers.ts`
  - `src/utils/pdfSplitUpload.ts`
  - `src/utils/pdfMediaFetch.ts`

### 8) Edge functions / backend automation
Edge functions are located under:
- `supabase/functions/*`

These typically cover backend-heavy tasks like:
- OCR extraction
- metadata extraction
- fetching/processing media
- smart matching / archiving flows

</div>


