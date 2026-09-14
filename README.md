# Notework

A calendar + notebook for students: week/month calendar with recurring classes,
assignments and exams, rich-text notes organised by class and folder, PDF
annotation, and a task list — all in one place, running in the browser.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run typecheck  # tsc
npm run lint       # oxlint
npm run build
```

## Architecture

- `src/types/models.ts` — every persisted shape lives here.
- `src/data/repository.ts` — the `DataRepository` / `FileStore` interfaces. The
  app only ever talks to these; `src/data/index.ts` picks the implementation
  (localStorage + IndexedDB by default) and can swap it at runtime. Add a
  backend by implementing the two interfaces.
- `src/data/backup.ts` — export/import of everything as one JSON file,
  including the PDF blobs that live outside the snapshot.
- `src/data/sync/` — optional multi-device sync (see below): the same two
  interfaces, wrapping the local ones and reconciling with Supabase.
- `src/data/store.ts` — Zustand store with all mutations. Writes are debounced
  and flushed on page hide.
- `src/lib/recurrence.ts` — expands recurring events into occurrences, with
  per-occurrence overrides and deletions.
- `src/lib/dates.ts` — smart relative due labels ("Due tomorrow at 5pm").
- `src/lib/quickAdd.ts` — natural-language parsing (chrono-node) for ⌘K and
  the task composer.
- `src/lib/annotations.ts` — PDF annotation geometry. Everything is stored in
  PDF page units, so rendering at any zoom is a multiply.
- `src/features/calendar` — week/month views, editor, occurrence card.
- `src/features/notes` — TipTap notes, class/folder tree.
- `src/features/pdf` — pdf.js viewer with ink/highlight/text/sticky tools.
- `src/features/tasks` — task list derived from assignments and exams.
- `src/features/links` — attach notes/PDFs to events (both directions).

## Sync (optional)

Notework is local-first and works with no account: data lives in this
browser's localStorage and IndexedDB, and **Settings → Export** is your
backup. Sync is opt-in — if it isn't configured, the UI never mentions it and
supabase-js isn't even bundled.

Turning it on takes about five minutes:

1. Create a free project at [supabase.com](https://supabase.com) (the free
   tier is well beyond what one person on a few devices needs).
2. In the project's **SQL Editor**, paste and run
   [`src/data/sync/schema.sql`](src/data/sync/schema.sql). It creates the
   snapshot table, the private PDF bucket, and the row-level security policies
   that keep each account's data to itself.
3. Under **Project Settings → API**, copy the **Project URL** and the
   **publishable** key (`sb_publishable_…`). Never use the **secret** key in
   this app — it bypasses row-level security and would be shipped to the
   browser.
4. For local development, `cp .env.example .env.local` and paste them in. For
   the deployed site, add them as the repository secrets
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` — the Pages workflow
   passes them through.
5. Optionally turn off **Authentication → Sign In / Providers → Confirm
   email** while testing, so a new account can sign in immediately.

Then open **Settings → Sync across devices**, create an account, and sign in
with the same account on your other devices.

How it behaves:

- **Local first.** Every read falls back to the on-device copy and every write
  lands there before the network is touched, so going offline degrades to
  exactly the local-only app. Changes sync on the next connection.
- **Last write wins**, on the whole snapshot. For one person on two or three
  devices this is the right trade; there is no merge and no CRDT. If you edit
  on two devices while offline, the one you saved most recently wins and the
  other copy is replaced.
- **PDFs** upload to the private bucket and download on demand, so a new
  device doesn't pull every file up front. Failed uploads are retried.
- **Signing in on a device that already has data** does not merge: the newer
  of the two copies wins. Export a backup first if that matters.
- **Reset** erases the account too, on every device, not just this browser.

## Features

- **Calendar** — week and month views, drag to create/move/resize, recurring
  classes with per-instance or whole-series edits, colour-coded classes.
- **Quick add** — `⌘K`, then "Physics HW due Friday 11pm".
- **Notes** — rich text with headings, lists, tasks, highlights; organised by
  class and folder; search.
- **PDFs** — upload slides/readings, annotate with pen, highlighter, text
  boxes and sticky notes; annotations stay aligned across zoom and resize.
- **Tasks** — assignments and exams grouped by urgency with checkboxes,
  priority and live relative due dates; click a due date to see attachments.
- **Linking** — attach notes or PDFs to any event from either side.

## Keyboard

`1`/`2`/`3` switch sections · `W`/`M` week/month · `T` today · `←`/`→` navigate ·
`N` new event · `⌘K` quick add · `⌘\` sidebar · `?` all shortcuts.
