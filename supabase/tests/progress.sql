\set ON_ERROR_STOP on
begin;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_class where oid = 'public.labwise_progress'::regclass and relrowsecurity and relforcerowsecurity) then
    raise exception 'Progress must enable and force RLS.';
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.labwise_progress', 'select,insert,update,delete,truncate,references,trigger') then
    raise exception 'anon must have no table privileges.';
  end if;
  if not pg_catalog.has_table_privilege('authenticated', 'public.labwise_progress', 'select,insert,update')
    or pg_catalog.has_table_privilege('authenticated', 'public.labwise_progress', 'delete,truncate,references,trigger') then
    raise exception 'authenticated grants are too broad or incomplete.';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.labwise_read_progress()', 'execute')
    or pg_catalog.has_function_privilege('anon', 'public.labwise_write_progress(bigint,jsonb)', 'execute') then
    raise exception 'anon must not execute either RPC.';
  end if;
  if (select count(*) from pg_catalog.pg_proc where oid in ('public.labwise_read_progress()'::regprocedure, 'public.labwise_write_progress(bigint,jsonb)'::regprocedure)
    and not prosecdef and proconfig @> array['search_path=""']) <> 2 then
    raise exception 'Both RPCs must be SECURITY INVOKER with an empty search path.';
  end if;
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$
declare
  empty_document jsonb := '{"version":1,"clock":[0,0],"records":{},"saved":{},"reading":{},"prefs":{},"events":{},"game":{"version":1,"checkpoint":null,"runs":{}},"frenzy":{}}'::jsonb;
  changed_document jsonb;
  result jsonb;
begin
  result := public.labwise_read_progress();
  if result <> '{"accepted":true,"revision":0,"document":null,"updatedAt":null}'::jsonb then raise exception 'New accounts must start at revision zero without creating a row.'; end if;
  result := public.labwise_write_progress(5, empty_document);
  if result <> '{"accepted":false,"revision":0,"document":null,"updatedAt":null}'::jsonb then raise exception 'A nonzero revision cannot create a row.'; end if;
  result := public.labwise_write_progress(0, empty_document);
  if result -> 'accepted' <> 'true'::jsonb or result -> 'revision' <> '1'::jsonb or result -> 'document' <> empty_document or result ->> 'updatedAt' is null then raise exception 'First write was not accepted at revision one.'; end if;
  if public.labwise_read_progress() <> result then raise exception 'Read did not return the caller''s stored progress.'; end if;
  changed_document := pg_catalog.jsonb_set(empty_document, '{clock}', '[2,0]');
  result := public.labwise_write_progress(0, changed_document);
  if result -> 'accepted' <> 'false'::jsonb or result -> 'revision' <> '1'::jsonb or result -> 'document' <> empty_document then raise exception 'Stale revision overwrote progress.'; end if;
  result := public.labwise_write_progress(1, changed_document);
  if result -> 'accepted' <> 'true'::jsonb or result -> 'revision' <> '2'::jsonb or result -> 'document' <> changed_document then raise exception 'Matching revision did not increment atomically.'; end if;
  if (select count(*) from public.labwise_progress) <> 1 then raise exception 'Owner cannot read their row.'; end if;
end;
$$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$
declare
  empty_document jsonb := '{"version":1,"clock":[0,0],"records":{},"saved":{},"reading":{},"prefs":{},"events":{},"game":{"version":1,"checkpoint":null,"runs":{}},"frenzy":{}}'::jsonb;
  affected integer;
begin
  if (select count(*) from public.labwise_progress) <> 0 then raise exception 'A second account read another owner''s row.'; end if;
  if (public.labwise_read_progress() -> 'revision') <> '0'::jsonb then raise exception 'RPC leaked another account''s progress.'; end if;
  -- Simulate the internal RPC marker to test the ownership clauses separately
  -- from the direct REST-write gate. PostgREST exposes no set_config RPC.
  perform pg_catalog.set_config('labwise.progress_rpc', 'write', true);
  update public.labwise_progress set revision = revision + 1 where user_id = '00000000-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'RLS allowed a wrong-owner update.'; end if;
  begin
    insert into public.labwise_progress (user_id, document, revision) values ('00000000-0000-0000-0000-000000000003', empty_document, 1);
    raise exception 'RLS allowed a wrong-owner insert.';
  exception when insufficient_privilege then null;
  end;
  perform pg_catalog.set_config('labwise.progress_rpc', '', true);
  perform public.labwise_write_progress(0, empty_document);
  update public.labwise_progress set revision = revision + 1 where user_id = auth.uid();
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Direct updates bypassed the CAS-only RPC gate, or the write marker leaked.'; end if;
  if public.labwise_read_progress() -> 'revision' <> '1'::jsonb then raise exception 'Direct update changed the owner''s revision.'; end if;
  perform pg_catalog.set_config('labwise.progress_rpc', 'write', true);
  begin
    update public.labwise_progress set user_id = '00000000-0000-0000-0000-000000000003';
    raise exception 'RLS allowed ownership reassignment.';
  exception when insufficient_privilege then null;
  end;
  perform pg_catalog.set_config('labwise.progress_rpc', '', true);
  begin
    delete from public.labwise_progress;
    raise exception 'Client role must not delete progress directly.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
do $$
declare
  empty_document jsonb := '{"version":1,"clock":[0,0],"records":{},"saved":{},"reading":{},"prefs":{},"events":{},"game":{"version":1,"checkpoint":null,"runs":{}},"frenzy":{}}'::jsonb;
  bad jsonb;
begin
  foreach bad in array array[
    null::jsonb, 'null'::jsonb, '[]'::jsonb, '{}'::jsonb,
    pg_catalog.jsonb_set(empty_document, '{version}', '2'),
    pg_catalog.jsonb_set(empty_document, '{records}', '[]'),
    empty_document || '{"accessToken":"must-not-be-stored"}'::jsonb,
    empty_document || '{"password":"must-not-be-stored"}'::jsonb,
    empty_document || '{"questions":[]}'::jsonb,
    pg_catalog.jsonb_set(empty_document, '{events}', pg_catalog.jsonb_build_object('oversized', pg_catalog.repeat('x', 8388608)))
  ] loop
    begin
      perform public.labwise_write_progress(0, bad);
      raise exception 'RPC accepted an invalid, unknown-field or oversized document.';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  begin
    perform public.labwise_write_progress(-1, empty_document);
    raise exception 'RPC accepted a negative revision.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.labwise_write_progress(null, empty_document);
    raise exception 'RPC accepted a null revision.';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.labwise_progress (user_id, document, revision) values (auth.uid(), empty_document, 1);
    raise exception 'Direct table insert bypassed the CAS-only RPC gate.';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.labwise_progress) <> 0 then raise exception 'Rejected writes created a partial row.'; end if;
end;
$$;

set local request.jwt.claim.sub = '';
do $$
begin
  begin
    perform public.labwise_read_progress();
    raise exception 'RPC accepted a missing user identity.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.labwise_write_progress(0, '{"version":1}');
    raise exception 'Write RPC accepted a missing user identity.';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.labwise_progress) <> 0 then raise exception 'RLS exposed rows without a user identity.'; end if;
end;
$$;

set local role anon;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$
begin
  begin
    perform public.labwise_read_progress();
    raise exception 'Anonymous role executed the read RPC.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.labwise_write_progress(0, '{"version":1}');
    raise exception 'Anonymous role executed the write RPC.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.labwise_progress;
    raise exception 'Anonymous role read progress directly.';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.labwise_progress (user_id, document, revision) values ('00000000-0000-0000-0000-000000000001', '{"version":1}', 1);
    raise exception 'Anonymous role wrote progress directly.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
do $$
declare
  empty_document jsonb := '{"version":1,"clock":[0,0],"records":{},"saved":{},"reading":{},"prefs":{},"events":{},"game":{"version":1,"checkpoint":null,"runs":{}},"frenzy":{}}'::jsonb;
begin
  -- Table constraints still apply to a privileged maintenance writer that
  -- bypasses RLS. Client roles cannot reach this direct write path at all.
  begin
    insert into public.labwise_progress (user_id, document, revision) values ('00000000-0000-0000-0000-000000000005', empty_document || '{"refreshToken":"must-not-be-stored"}'::jsonb, 1);
    raise exception 'Direct maintenance insert bypassed document constraints.';
  exception when check_violation then null;
  end;
  begin
    insert into public.labwise_progress (user_id, document, revision) values ('00000000-0000-0000-0000-000000000005', pg_catalog.jsonb_set(empty_document, '{events}', pg_catalog.jsonb_build_object('oversized', pg_catalog.repeat('x', 8388608))), 1);
    raise exception 'Direct maintenance insert bypassed the size limit.';
  exception when check_violation then null;
  end;
end;
$$;
delete from auth.users where id = '00000000-0000-0000-0000-000000000001';
do $$
begin
  if exists (select 1 from public.labwise_progress where user_id = '00000000-0000-0000-0000-000000000001') then raise exception 'Deleting an Auth account must cascade to its progress.'; end if;
  if not exists (select 1 from public.labwise_progress where user_id = '00000000-0000-0000-0000-000000000002') then raise exception 'Cascade deletion removed another account''s progress.'; end if;
end;
$$;
commit;
\echo Role grants, RLS, document limits, CAS, account isolation and deletion cascade passed.
