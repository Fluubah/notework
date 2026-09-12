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
- `src/features/*` — calendar, notes, pdf, tasks, shell.

## Keyboard

`1`/`2`/`3` switch sections · `W`/`M` week/month · `T` today · `←`/`→` navigate ·
`N` new event · `⌘K` quick add · `⌘\` sidebar · `?` all shortcuts.
