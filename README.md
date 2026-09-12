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
  (localStorage + IndexedDB today). Swap in a backend by implementing the two
  interfaces and changing that one file.
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
