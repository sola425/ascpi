-- Run in the SQL editor of your own Supabase project. This migration does not
-- need an API key or change Auth's schema, and it preserves rows on re-run.
begin;

create table if not exists public.labwise_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  document jsonb not null,
  revision bigint not null check (revision > 0 and revision <= 9007199254740991),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

-- Upgrade the earlier version-1 document shape without erasing progress or
-- changing its revision. Frenzy's empty metadata is a neutral merge value.
alter table public.labwise_progress drop constraint if exists labwise_progress_document_check;
update public.labwise_progress set document = document || '{"frenzy":{}}'::jsonb where not document ? 'frenzy';
alter table public.labwise_progress add constraint labwise_progress_document_check check (
    pg_catalog.jsonb_typeof(document) = 'object'
    and document @> '{"version":1}'::jsonb
    and document ?& array['version','clock','records','saved','reading','prefs','events','game','frenzy']
    and document - array['version','clock','records','saved','reading','prefs','events','game','frenzy'] = '{}'::jsonb
    and pg_catalog.jsonb_typeof(document -> 'clock') = 'array'
    and pg_catalog.jsonb_typeof(document -> 'records') = 'object'
    and pg_catalog.jsonb_typeof(document -> 'saved') = 'object'
    and pg_catalog.jsonb_typeof(document -> 'reading') = 'object'
    and pg_catalog.jsonb_typeof(document -> 'prefs') = 'object'
    and pg_catalog.jsonb_typeof(document -> 'events') = 'object'
    and pg_catalog.jsonb_typeof(document -> 'game') = 'object'
    and pg_catalog.jsonb_typeof(document -> 'frenzy') = 'object'
    and pg_catalog.octet_length(document::text) <= 8388608
  );

alter table public.labwise_progress enable row level security;
alter table public.labwise_progress force row level security;

-- Supabase projects can have broad default grants. Revoke them explicitly;
-- RLS then restricts the minimum privileges needed by SECURITY INVOKER RPCs.
-- The write RPC sets/restores a transaction-local marker so ordinary direct
-- REST mutations cannot bypass compare-and-swap, even for the caller's own row.
revoke all on table public.labwise_progress from public, anon, authenticated;
grant select, insert, update on table public.labwise_progress to authenticated;

drop policy if exists labwise_progress_read_own on public.labwise_progress;
create policy labwise_progress_read_own on public.labwise_progress
  for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists labwise_progress_insert_own on public.labwise_progress;
create policy labwise_progress_insert_own on public.labwise_progress
  for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id
    and (select pg_catalog.current_setting('labwise.progress_rpc', true)) = 'write');

drop policy if exists labwise_progress_update_own on public.labwise_progress;
create policy labwise_progress_update_own on public.labwise_progress
  for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id
    and (select pg_catalog.current_setting('labwise.progress_rpc', true)) = 'write')
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id
    and (select pg_catalog.current_setting('labwise.progress_rpc', true)) = 'write');

create or replace function public.labwise_read_progress()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  result jsonb;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'An authenticated account is required.';
  end if;
  select pg_catalog.jsonb_build_object(
    'accepted', true,
    'revision', p.revision,
    'document', p.document,
    'updatedAt', p.updated_at
  ) into result
  from public.labwise_progress as p where p.user_id = caller;
  return coalesce(result, pg_catalog.jsonb_build_object(
    'accepted', true, 'revision', 0, 'document', null, 'updatedAt', null
  ));
end;
$$;

create or replace function public.labwise_write_progress(expected_revision bigint, document jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  saved public.labwise_progress%rowtype;
  accepted boolean := false;
  previous_guard text := pg_catalog.current_setting('labwise.progress_rpc', true);
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'An authenticated account is required.';
  end if;
  if expected_revision is null or expected_revision < 0 or expected_revision >= 9007199254740991 then
    raise exception using errcode = '22023', message = 'Invalid progress revision.';
  end if;
  if document is null
    or pg_catalog.jsonb_typeof(document) <> 'object'
    or not document @> '{"version":1}'::jsonb
    or not document ?& array['version','clock','records','saved','reading','prefs','events','game','frenzy']
    or document - array['version','clock','records','saved','reading','prefs','events','game','frenzy'] <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(document -> 'clock') <> 'array'
    or pg_catalog.jsonb_typeof(document -> 'records') <> 'object'
    or pg_catalog.jsonb_typeof(document -> 'saved') <> 'object'
    or pg_catalog.jsonb_typeof(document -> 'reading') <> 'object'
    or pg_catalog.jsonb_typeof(document -> 'prefs') <> 'object'
    or pg_catalog.jsonb_typeof(document -> 'events') <> 'object'
    or pg_catalog.jsonb_typeof(document -> 'game') <> 'object'
    or pg_catalog.jsonb_typeof(document -> 'frenzy') <> 'object'
    or pg_catalog.octet_length(document::text) > 8388608 then
    raise exception using errcode = '22023', message = 'Invalid progress document.';
  end if;

  perform pg_catalog.set_config('labwise.progress_rpc', 'write', true);
  begin
    -- Lock an existing row before comparing. A second device waits, then sees
    -- the newly committed revision and receives a conflict without overwriting it.
    select p.* into saved from public.labwise_progress as p
      where p.user_id = caller for update;
    if found then
      if saved.revision = expected_revision then
        update public.labwise_progress as p set
          document = labwise_write_progress.document,
          revision = p.revision + 1,
          updated_at = pg_catalog.clock_timestamp()
        where p.user_id = caller
        returning p.* into saved;
        accepted := true;
      end if;
    elsif expected_revision = 0 then
      -- SELECT FOR UPDATE cannot lock an absent row. ON CONFLICT handles two
      -- simultaneous first saves: only one inserts; the other reads its winner.
      insert into public.labwise_progress (user_id, document, revision, updated_at)
        values (caller, labwise_write_progress.document, 1, pg_catalog.clock_timestamp())
        on conflict (user_id) do nothing returning * into saved;
      if found then
        accepted := true;
      else
        select p.* into saved from public.labwise_progress as p
          where p.user_id = caller for update;
      end if;
    end if;
  exception when others then
    perform pg_catalog.set_config('labwise.progress_rpc', coalesce(previous_guard, ''), true);
    raise;
  end;
  perform pg_catalog.set_config('labwise.progress_rpc', coalesce(previous_guard, ''), true);

  return pg_catalog.jsonb_build_object(
    'accepted', accepted, 'revision', coalesce(saved.revision, 0),
    'document', saved.document, 'updatedAt', saved.updated_at
  );
end;
$$;

-- Functions otherwise inherit EXECUTE for PUBLIC. Only signed-in users may
-- invoke these RPCs; neither accepts a caller-supplied user ID.
revoke all on function public.labwise_read_progress() from public, anon, authenticated;
revoke all on function public.labwise_write_progress(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.labwise_read_progress() to authenticated;
grant execute on function public.labwise_write_progress(bigint, jsonb) to authenticated;

comment on table public.labwise_progress is 'Optional per-account Labwise progress; no passwords, auth tokens, audio or question-bank files.';
comment on function public.labwise_write_progress(bigint, jsonb) is 'Atomic compare-and-swap. accepted=false returns the current row without changing it.';

notify pgrst, 'reload schema';
commit;
