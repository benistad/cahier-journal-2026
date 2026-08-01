-- Cahier Journal 2026 — stockage distant versionné, mono-utilisateur via Auth.
-- Cette migration est idempotente et n'insère aucune donnée pédagogique.

create table if not exists public.journal_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 2 check (schema_version = 2),
  revision bigint not null default 1 check (revision > 0),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint journal_state_data_object check (jsonb_typeof(data) = 'object'),
  constraint journal_state_data_version check ((data ->> 'schemaVersion')::integer = schema_version)
);

alter table public.journal_state enable row level security;

drop policy if exists "owner_select_journal" on public.journal_state;
create policy "owner_select_journal"
on public.journal_state for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "owner_insert_journal" on public.journal_state;
create policy "owner_insert_journal"
on public.journal_state for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "owner_update_journal" on public.journal_state;
create policy "owner_update_journal"
on public.journal_state for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

revoke all on table public.journal_state from anon;
grant select, insert, update on table public.journal_state to authenticated;
grant all on table public.journal_state to service_role;

create or replace function public.initialize_journal(p_initial_data jsonb)
returns public.journal_state
language plpgsql
security invoker
set search_path = public
as $$
declare
  result public.journal_state;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_initial_data) <> 'object' or p_initial_data ->> 'schemaVersion' <> '2' then
    raise exception 'Invalid journal schema' using errcode = '22023';
  end if;

  insert into public.journal_state (owner_id, schema_version, revision, data)
  values ((select auth.uid()), 2, 1, p_initial_data)
  on conflict (owner_id) do nothing
  returning * into result;

  if result.owner_id is null then
    select * into result from public.journal_state where owner_id = (select auth.uid());
  end if;
  return result;
end;
$$;

create or replace function public.save_journal(
  p_expected_revision bigint,
  p_new_data jsonb
)
returns public.journal_state
language plpgsql
security invoker
set search_path = public
as $$
declare
  result public.journal_state;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_new_data) <> 'object' or p_new_data ->> 'schemaVersion' <> '2' then
    raise exception 'Invalid journal schema' using errcode = '22023';
  end if;

  update public.journal_state
  set data = p_new_data,
      revision = revision + 1,
      updated_at = now()
  where owner_id = (select auth.uid())
    and revision = p_expected_revision
  returning * into result;

  if result.owner_id is null then
    raise exception 'Journal revision conflict' using errcode = '40001';
  end if;
  return result;
end;
$$;

revoke all on function public.initialize_journal(jsonb) from public, anon;
revoke all on function public.save_journal(bigint, jsonb) from public, anon;
grant execute on function public.initialize_journal(jsonb) to authenticated, service_role;
grant execute on function public.save_journal(bigint, jsonb) to authenticated, service_role;

-- Realtime permet aux autres appareils de détecter immédiatement une révision.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'journal_state'
  ) then
    alter publication supabase_realtime add table public.journal_state;
  end if;
end $$;

-- Bucket privé réservé aux futures pièces jointes migrées hors du JSON.
insert into storage.buckets (id, name, public, file_size_limit)
values ('journal-attachments', 'journal-attachments', false, 10485760)
on conflict (id) do update
set public = false, file_size_limit = 10485760;

drop policy if exists "owner_read_journal_attachments" on storage.objects;
create policy "owner_read_journal_attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'journal-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "owner_insert_journal_attachments" on storage.objects;
create policy "owner_insert_journal_attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'journal-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "owner_update_journal_attachments" on storage.objects;
create policy "owner_update_journal_attachments"
on storage.objects for update to authenticated
using (
  bucket_id = 'journal-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'journal-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "owner_delete_journal_attachments" on storage.objects;
create policy "owner_delete_journal_attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'journal-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
