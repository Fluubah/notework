-- Notework sync schema.
--
-- Run this once in your Supabase project: SQL Editor -> New query -> paste ->
-- Run. It creates the snapshot table, the PDF bucket, and the row-level
-- security policies that keep each account's data to itself.

-- ---------------------------------------------------------------- snapshots
create table if not exists public.notework_snapshots (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  device_id  text
);

alter table public.notework_snapshots enable row level security;

-- One row per account, readable and writable only by that account.
drop policy if exists "own snapshot readable" on public.notework_snapshots;
create policy "own snapshot readable"
  on public.notework_snapshots for select
  using (auth.uid() = user_id);

drop policy if exists "own snapshot insertable" on public.notework_snapshots;
create policy "own snapshot insertable"
  on public.notework_snapshots for insert
  with check (auth.uid() = user_id);

drop policy if exists "own snapshot updatable" on public.notework_snapshots;
create policy "own snapshot updatable"
  on public.notework_snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own snapshot deletable" on public.notework_snapshots;
create policy "own snapshot deletable"
  on public.notework_snapshots for delete
  using (auth.uid() = user_id);

-- -------------------------------------------------------------- PDF storage
-- Private bucket; the app uploads each account's files under a folder named
-- with its user id, which is what the policies below key off.
insert into storage.buckets (id, name, public)
values ('notework-files', 'notework-files', false)
on conflict (id) do nothing;

drop policy if exists "own files readable" on storage.objects;
create policy "own files readable"
  on storage.objects for select
  using (bucket_id = 'notework-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own files insertable" on storage.objects;
create policy "own files insertable"
  on storage.objects for insert
  with check (bucket_id = 'notework-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own files updatable" on storage.objects;
create policy "own files updatable"
  on storage.objects for update
  using (bucket_id = 'notework-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own files deletable" on storage.objects;
create policy "own files deletable"
  on storage.objects for delete
  using (bucket_id = 'notework-files' and (storage.foldername(name))[1] = auth.uid()::text);
