-- Private, asynchronous two-friend quizzes. Run after the progress migration;
-- seed labwise_quiz_questions from the matching app release before use.
begin;

create schema if not exists labwise_private;
revoke all on schema labwise_private from public, anon, authenticated;

create table if not exists public.labwise_quiz_questions (
  id text primary key check (length(id) between 1 and 200),
  topic text not null check (length(topic) between 1 and 120),
  book_id text not null check (length(book_id) between 1 and 80),
  answer_index smallint not null,
  option_count smallint not null check (option_count between 2 and 6),
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true,
  check (answer_index >= 0 and answer_index < option_count)
);
alter table public.labwise_quiz_questions enable row level security;
revoke all on table public.labwise_quiz_questions from public, anon, authenticated;
create index if not exists labwise_quiz_questions_release on public.labwise_quiz_questions(content_digest, book_id, topic) where enabled;

create table if not exists labwise_private.challenges (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  code text not null unique check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'),
  creator_id uuid not null references auth.users(id) on delete cascade,
  joiner_id uuid references auth.users(id) on delete cascade,
  topics text[] not null,
  books text[] not null,
  question_count integer not null check (question_count in (10, 20)),
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null default (pg_catalog.clock_timestamp() + interval '7 days'),
  check (joiner_id is null or joiner_id <> creator_id)
);
create index if not exists labwise_challenges_creator_created on labwise_private.challenges(creator_id, created_at desc);
create index if not exists labwise_challenges_joiner_created on labwise_private.challenges(joiner_id, created_at desc) where joiner_id is not null;

-- Snapshot keys have no FK to the mutable release registry. Updating that
-- registry must never regrade or reorder a challenge already in progress.
create table if not exists labwise_private.challenge_questions (
  challenge_id uuid not null references labwise_private.challenges(id) on delete cascade,
  position integer not null check (position between 0 and 19),
  question_id text not null,
  answer_index smallint not null,
  option_count smallint not null check (option_count between 2 and 6),
  primary key (challenge_id, position),
  unique (challenge_id, question_id),
  check (answer_index >= 0 and answer_index < option_count)
);

create table if not exists labwise_private.challenge_players (
  challenge_id uuid not null references labwise_private.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null default 0 check (position between 0 and 19),
  phase text not null default 'ready' check (phase in ('ready','question','feedback','complete')),
  deadline timestamptz,
  score integer not null default 0 check (score between 0 and 2000 and score % 100 = 0),
  hearts integer not null default 3 check (hearts between 0 and 3),
  primary key (challenge_id, user_id),
  check ((phase = 'question') = (deadline is not null))
);

create table if not exists labwise_private.challenge_answers (
  challenge_id uuid not null,
  user_id uuid not null,
  position integer not null check (position between 0 and 19),
  choice integer check (choice between 0 and 5),
  correct boolean not null,
  timed_out boolean not null,
  answered_at timestamptz not null,
  primary key (challenge_id, user_id, position),
  foreign key (challenge_id, user_id) references labwise_private.challenge_players(challenge_id, user_id) on delete cascade,
  foreign key (challenge_id, position) references labwise_private.challenge_questions(challenge_id, position) on delete cascade
);

create table if not exists labwise_private.challenge_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  join_window timestamptz not null default pg_catalog.clock_timestamp(),
  join_count integer not null default 0,
  join_day_window timestamptz not null default pg_catalog.clock_timestamp(),
  join_day_count integer not null default 0,
  create_window timestamptz not null default pg_catalog.clock_timestamp(),
  create_count integer not null default 0,
  create_day_window timestamptz not null default pg_catalog.clock_timestamp(),
  create_day_count integer not null default 0
);
alter table labwise_private.challenge_limits add column if not exists create_window timestamptz not null default pg_catalog.clock_timestamp();
alter table labwise_private.challenge_limits add column if not exists create_count integer not null default 0;
alter table labwise_private.challenge_limits add column if not exists create_day_window timestamptz not null default pg_catalog.clock_timestamp();
alter table labwise_private.challenge_limits add column if not exists create_day_count integer not null default 0;

alter table labwise_private.challenges enable row level security;
alter table labwise_private.challenge_questions enable row level security;
alter table labwise_private.challenge_players enable row level security;
alter table labwise_private.challenge_answers enable row level security;
alter table labwise_private.challenge_limits enable row level security;
revoke all on all tables in schema labwise_private from public, anon, authenticated;

-- Helpers are unreachable by API roles. They run only inside a narrowly
-- granted SECURITY DEFINER entry point owned by the migration/table owner.
create or replace function labwise_private.lock_challenge(challenge_id uuid, caller uuid)
returns labwise_private.challenges
language plpgsql security invoker set search_path = ''
as $$
declare c labwise_private.challenges%rowtype;
begin
  if caller is null then raise exception using errcode = '42501', message = 'An authenticated account is required.'; end if;
  select h.* into c from labwise_private.challenges h where h.id = challenge_id for update;
  if not found or (c.creator_id <> caller and c.joiner_id is distinct from caller) then
    raise exception using errcode = '42501', message = 'Challenge unavailable.';
  end if;
  return c;
end;
$$;

create or replace function labwise_private.grade_answer(challenge_id uuid, player_id uuid, selected_choice integer, is_timeout boolean, at_time timestamptz)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  p labwise_private.challenge_players%rowtype;
  q labwise_private.challenge_questions%rowtype;
  is_correct boolean;
  inserted integer;
begin
  select s.* into p from labwise_private.challenge_players s where s.challenge_id = grade_answer.challenge_id and s.user_id = player_id for update;
  if not found or p.phase <> 'question' then return; end if;
  select s.* into strict q from labwise_private.challenge_questions s where s.challenge_id = grade_answer.challenge_id and s.position = p.position;
  if selected_choice is not null and (selected_choice < 0 or selected_choice >= q.option_count) then
    raise exception using errcode = '22023', message = 'Invalid answer selection.';
  end if;
  is_correct := not is_timeout and coalesce(selected_choice = q.answer_index, false);
  insert into labwise_private.challenge_answers(challenge_id, user_id, position, choice, correct, timed_out, answered_at)
    values (grade_answer.challenge_id, player_id, p.position, case when is_timeout then null else selected_choice end, is_correct, is_timeout, at_time)
    on conflict on constraint challenge_answers_pkey do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return; end if;
  update labwise_private.challenge_players s set
    score = s.score + case when is_correct then 100 else 0 end,
    hearts = s.hearts - case when is_correct then 0 else 1 end,
    phase = 'feedback', deadline = null
    where s.challenge_id = grade_answer.challenge_id and s.user_id = player_id;
end;
$$;

create or replace function labwise_private.settle_challenge(c labwise_private.challenges, at_time timestamptz)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare p labwise_private.challenge_players%rowtype;
begin
  if at_time >= c.expires_at then
    update labwise_private.challenge_players s set phase = 'complete', deadline = null where s.challenge_id = c.id and s.phase <> 'complete';
    return;
  end if;
  for p in select s.* from labwise_private.challenge_players s where s.challenge_id = c.id and s.phase = 'question' and s.deadline <= at_time order by s.user_id loop
    perform labwise_private.grade_answer(c.id, p.user_id, null, true, at_time);
  end loop;
end;
$$;

create or replace function labwise_private.player_summary(challenge_id uuid, player_id uuid, question_count integer)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  p labwise_private.challenge_players%rowtype;
  answered integer;
begin
  if player_id is null then return null; end if;
  select s.* into p from labwise_private.challenge_players s where s.challenge_id = player_summary.challenge_id and s.user_id = player_id;
  if not found then return null; end if;
  select count(*)::integer into answered from labwise_private.challenge_answers a where a.challenge_id = player_summary.challenge_id and a.user_id = player_id;
  return pg_catalog.jsonb_build_object('score',p.score,'hearts',p.hearts,'answered',answered,'phase',p.phase,
    'complete',p.phase = 'complete' or p.hearts = 0 or (p.phase = 'feedback' and p.position = question_count - 1));
end;
$$;

create or replace function labwise_private.challenge_summary(challenge_id uuid, caller uuid, at_time timestamptz)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  c labwise_private.challenges%rowtype;
  you jsonb;
  opponent jsonb;
  status text;
  result text := null;
begin
  select h.* into strict c from labwise_private.challenges h where h.id = challenge_id;
  you := labwise_private.player_summary(c.id, caller, c.question_count);
  opponent := labwise_private.player_summary(c.id, case when caller = c.creator_id then c.joiner_id else c.creator_id end, c.question_count);
  status := case when at_time >= c.expires_at then 'expired' when c.joiner_id is null then 'waiting'
    when (you ->> 'complete')::boolean and (opponent ->> 'complete')::boolean then 'complete' else 'playing' end;
  if status = 'complete' then
    result := case when (you ->> 'score')::integer > (opponent ->> 'score')::integer then 'win'
      when (you ->> 'score')::integer < (opponent ->> 'score')::integer then 'loss' else 'draw' end;
  end if;
  return pg_catalog.jsonb_build_object('id',c.id,'code',c.code,'topics',c.topics,'books',c.books,'questionCount',c.question_count,
    'contentDigest',c.content_digest,'createdAt',c.created_at,'expiresAt',c.expires_at,'serverNow',at_time,
    'status',status,'you',you,'opponent',opponent,'result',result);
end;
$$;

create or replace function labwise_private.challenge_turn(challenge_id uuid, caller uuid, at_time timestamptz)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  p labwise_private.challenge_players%rowtype;
  q labwise_private.challenge_questions%rowtype;
  a labwise_private.challenge_answers%rowtype;
  feedback jsonb := null;
  summary jsonb;
begin
  summary := labwise_private.challenge_summary(challenge_id, caller, at_time);
  select s.* into strict p from labwise_private.challenge_players s where s.challenge_id = challenge_turn.challenge_id and s.user_id = caller;
  select s.* into q from labwise_private.challenge_questions s where s.challenge_id = challenge_turn.challenge_id and s.position = p.position;
  if p.phase in ('feedback','complete') then
    select s.* into a from labwise_private.challenge_answers s where s.challenge_id = challenge_turn.challenge_id and s.user_id = caller and s.position = p.position;
    if found then
      feedback := pg_catalog.jsonb_build_object('qid',q.question_id,'index',a.position,'choice',a.choice,'answerIndex',q.answer_index,
        'correct',a.correct,'timedOut',a.timed_out,'answeredAt',a.answered_at);
    end if;
  end if;
  return summary || pg_catalog.jsonb_build_object('qid',case when summary ->> 'status' = 'expired' then null else q.question_id end,
    'position',p.position,'deadline',p.deadline,'phase',case when p.phase = 'ready' then 'question' else p.phase end,'lastAnswer',feedback);
end;
$$;

create or replace function public.labwise_create_challenge(topics text[], books text[], question_count integer, content_digest text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  c labwise_private.challenges%rowtype;
  chosen text[];
  clean_topics text[];
  clean_books text[];
  at_time timestamptz;
  raw bigint;
  invite_code text;
  inserted integer;
  attempt integer;
  limits labwise_private.challenge_limits%rowtype;
begin
  if caller is null then raise exception using errcode = '42501', message = 'An authenticated account is required.'; end if;
  if question_count is null or question_count not in (10,20) or content_digest is null or content_digest !~ '^[a-f0-9]{64}$'
    or topics is null or books is null or coalesce(pg_catalog.array_ndims(topics),1) <> 1 or coalesce(pg_catalog.array_ndims(books),1) <> 1
    or pg_catalog.cardinality(topics) > 50 or pg_catalog.cardinality(books) > 8
    or exists(select 1 from pg_catalog.unnest(topics) v where v is null or length(v) not between 1 and 120 or v ~ '[[:cntrl:]]')
    or exists(select 1 from pg_catalog.unnest(books) v where v is null or length(v) not between 1 and 80 or v ~ '[[:cntrl:]]') then
    raise exception using errcode = '22023', message = 'Invalid challenge settings.';
  end if;
  select coalesce(pg_catalog.array_agg(distinct v order by v),'{}'::text[]) into clean_topics from pg_catalog.unnest(topics) v;
  select coalesce(pg_catalog.array_agg(distinct v order by v),'{}'::text[]) into clean_books from pg_catalog.unnest(books) v;

  insert into labwise_private.challenge_limits(user_id) values(caller) on conflict(user_id) do nothing;
  select l.* into limits from labwise_private.challenge_limits l where l.user_id = caller for update;
  at_time := pg_catalog.clock_timestamp();
  if at_time >= limits.create_window + interval '1 hour' then limits.create_window := at_time; limits.create_count := 0; end if;
  if at_time >= limits.create_day_window + interval '1 day' then limits.create_day_window := at_time; limits.create_day_count := 0; end if;
  if limits.create_count >= 5 or limits.create_day_count >= 20
    or (select count(*) from labwise_private.challenges h where h.creator_id = caller and h.created_at > at_time - interval '1 hour') >= 5
    or (select count(*) from labwise_private.challenges h where h.creator_id = caller and h.created_at > at_time - interval '1 day') >= 20 then
    return '{"errorCode":"rate_limit"}'::jsonb;
  end if;
  update labwise_private.challenge_limits l set create_window=limits.create_window, create_count=limits.create_count+1,
    create_day_window=limits.create_day_window, create_day_count=limits.create_day_count+1 where l.user_id=caller;
  if exists(select 1 from pg_catalog.unnest(clean_topics) v where not exists(
      select 1 from public.labwise_quiz_questions q where q.enabled and q.content_digest=labwise_create_challenge.content_digest and q.topic=v))
    or exists(select 1 from pg_catalog.unnest(clean_books) v where not exists(
      select 1 from public.labwise_quiz_questions q where q.enabled and q.content_digest=labwise_create_challenge.content_digest and q.book_id=v)) then
    return '{"errorCode":"content"}'::jsonb;
  end if;
  select pg_catalog.array_agg(selected.id) into chosen from (
    select q.id from public.labwise_quiz_questions q where q.enabled and q.content_digest = labwise_create_challenge.content_digest
      and (pg_catalog.cardinality(clean_topics) = 0 or q.topic = any(clean_topics))
      and (pg_catalog.cardinality(clean_books) = 0 or q.book_id = any(clean_books))
      order by pg_catalog.random() limit question_count for share
  ) selected;
  if coalesce(pg_catalog.cardinality(chosen),0) <> question_count then return '{"errorCode":"content"}'::jsonb; end if;

  for attempt in 1..5 loop
    -- First 40 UUID bits are cryptographically random; base32 gives eight
    -- characters without ambiguous I/O/0/1. Unique constraint handles collisions.
    raw := ('x' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,10))::bit(40)::bigint;
    invite_code := '';
    for inserted in 1..8 loop
      invite_code := invite_code || pg_catalog.substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (raw % 32)::integer + 1, 1);
      raw := raw / 32;
    end loop;
    insert into labwise_private.challenges(code,creator_id,topics,books,question_count,content_digest,created_at,expires_at)
      values(invite_code,caller,clean_topics,clean_books,question_count,content_digest,at_time,at_time + interval '7 days')
      on conflict(code) do nothing returning * into c;
    if found then exit; end if;
  end loop;
  if c.id is null then raise exception using errcode = '54000', message = 'Challenge creation unavailable.'; end if;
  insert into labwise_private.challenge_questions(challenge_id,position,question_id,answer_index,option_count)
    select c.id, (selected.position - 1)::integer, q.id, q.answer_index, q.option_count
    from pg_catalog.unnest(chosen) with ordinality selected(id,position) join public.labwise_quiz_questions q on q.id = selected.id;
  insert into labwise_private.challenge_players(challenge_id,user_id) values(c.id,caller);
  return labwise_private.challenge_summary(c.id,caller,at_time);
end;
$$;

create or replace function public.labwise_join_challenge(invitation_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  c labwise_private.challenges%rowtype;
  limits labwise_private.challenge_limits%rowtype;
  at_time timestamptz;
  normalized_code text := pg_catalog.upper(pg_catalog.btrim(invitation_code));
begin
  if caller is null then raise exception using errcode = '42501', message = 'An authenticated account is required.'; end if;
  insert into labwise_private.challenge_limits(user_id) values(caller) on conflict(user_id) do nothing;
  select l.* into limits from labwise_private.challenge_limits l where l.user_id = caller for update;
  at_time := pg_catalog.clock_timestamp();
  if at_time >= limits.join_window + interval '1 hour' then limits.join_window := at_time; limits.join_count := 0; end if;
  if at_time >= limits.join_day_window + interval '1 day' then limits.join_day_window := at_time; limits.join_day_count := 0; end if;
  if limits.join_count >= 30 or limits.join_day_count >= 100 then return '{"errorCode":"rate_limit"}'::jsonb; end if;
  update labwise_private.challenge_limits l set join_window = limits.join_window, join_count = limits.join_count + 1,
    join_day_window = limits.join_day_window, join_day_count = limits.join_day_count + 1 where l.user_id = caller;
  -- Failed invitations return a fixed value rather than raising: otherwise
  -- PostgreSQL would roll back the failed-attempt counter with the exception.
  if normalized_code is null or normalized_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' then return '{"errorCode":"unavailable"}'::jsonb; end if;
  select h.* into c from labwise_private.challenges h where h.code = normalized_code for update;
  at_time := pg_catalog.clock_timestamp();
  if not found then return '{"errorCode":"unavailable"}'::jsonb; end if;
  if caller <> c.creator_id and c.joiner_id is distinct from caller then
    if c.joiner_id is not null or at_time >= c.expires_at then return '{"errorCode":"unavailable"}'::jsonb; end if;
    update labwise_private.challenges h set joiner_id = caller where h.id = c.id returning h.* into c;
    insert into labwise_private.challenge_players(challenge_id,user_id) values(c.id,caller);
  end if;
  at_time := pg_catalog.clock_timestamp();
  perform labwise_private.settle_challenge(c,at_time);
  return labwise_private.challenge_summary(c.id,caller,at_time);
end;
$$;

create or replace function public.labwise_list_challenges()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  c labwise_private.challenges%rowtype;
  at_time timestamptz;
  result jsonb := '[]'::jsonb;
begin
  if caller is null then raise exception using errcode = '42501', message = 'An authenticated account is required.'; end if;
  -- Every list uses the same global lock order. No profile data or local
  -- challenge history is needed to resume on the account's second device.
  for c in select h.* from labwise_private.challenges h where h.creator_id=caller or h.joiner_id=caller
    order by h.created_at desc,h.id desc limit 20 for update loop
    at_time := pg_catalog.clock_timestamp();
    perform labwise_private.settle_challenge(c,at_time);
    result := result || pg_catalog.jsonb_build_array(labwise_private.challenge_summary(c.id,caller,at_time));
  end loop;
  return result;
end;
$$;

create or replace function public.labwise_get_challenge(challenge_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  c labwise_private.challenges%rowtype;
  at_time timestamptz;
begin
  c := labwise_private.lock_challenge(challenge_id,caller);
  at_time := pg_catalog.clock_timestamp();
  perform labwise_private.settle_challenge(c,at_time);
  return labwise_private.challenge_summary(c.id,caller,at_time);
end;
$$;

create or replace function public.labwise_get_turn(challenge_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  c labwise_private.challenges%rowtype;
  at_time timestamptz;
begin
  c := labwise_private.lock_challenge(challenge_id,caller);
  at_time := pg_catalog.clock_timestamp();
  perform labwise_private.settle_challenge(c,at_time);
  if at_time < c.expires_at then
    update labwise_private.challenge_players p set phase = 'question', deadline = at_time + interval '30 seconds'
      where p.challenge_id = c.id and p.user_id = caller and p.phase = 'ready';
  end if;
  return labwise_private.challenge_turn(c.id,caller,at_time);
end;
$$;

create or replace function public.labwise_submit_answer(challenge_id uuid, question_index integer, choice integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  c labwise_private.challenges%rowtype;
  p labwise_private.challenge_players%rowtype;
  at_time timestamptz;
begin
  c := labwise_private.lock_challenge(challenge_id,caller);
  if question_index is null or question_index < 0 or question_index >= c.question_count or (choice is not null and (choice < 0 or choice > 5)) then
    raise exception using errcode = '22023', message = 'Invalid answer selection.';
  end if;
  at_time := pg_catalog.clock_timestamp();
  perform labwise_private.settle_challenge(c,at_time);
  select s.* into strict p from labwise_private.challenge_players s where s.challenge_id = c.id and s.user_id = caller;
  if at_time < c.expires_at and p.phase = 'question' and p.position = question_index and choice is not null then
    perform labwise_private.grade_answer(c.id,caller,choice,false,at_time);
  elsif at_time < c.expires_at and p.phase = 'ready' then
    update labwise_private.challenge_players s set phase = 'question', deadline = at_time + interval '30 seconds'
      where s.challenge_id = c.id and s.user_id = caller;
  end if;
  -- Null is only a request to settle an elapsed deadline, never a client-
  -- asserted timeout. An early or stale submission cannot advance a turn.
  return labwise_private.challenge_turn(c.id,caller,at_time);
end;
$$;

create or replace function public.labwise_next_turn(challenge_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  c labwise_private.challenges%rowtype;
  p labwise_private.challenge_players%rowtype;
  at_time timestamptz;
begin
  c := labwise_private.lock_challenge(challenge_id,caller);
  at_time := pg_catalog.clock_timestamp();
  perform labwise_private.settle_challenge(c,at_time);
  select s.* into strict p from labwise_private.challenge_players s where s.challenge_id = c.id and s.user_id = caller;
  if at_time < c.expires_at and p.phase in ('ready','feedback') then
    if p.hearts = 0 or (p.phase = 'feedback' and p.position = c.question_count - 1) then
      update labwise_private.challenge_players s set phase = 'complete', deadline = null where s.challenge_id = c.id and s.user_id = caller;
    else
      update labwise_private.challenge_players s set phase = 'question', position = s.position + case when p.phase = 'feedback' then 1 else 0 end,
        deadline = at_time + interval '30 seconds' where s.challenge_id = c.id and s.user_id = caller;
    end if;
  end if;
  return labwise_private.challenge_turn(c.id,caller,at_time);
end;
$$;

revoke all on all functions in schema labwise_private from public, anon, authenticated;
revoke all on function public.labwise_create_challenge(text[],text[],integer,text) from public, anon, authenticated;
revoke all on function public.labwise_join_challenge(text) from public, anon, authenticated;
revoke all on function public.labwise_list_challenges() from public, anon, authenticated;
revoke all on function public.labwise_get_challenge(uuid) from public, anon, authenticated;
revoke all on function public.labwise_get_turn(uuid) from public, anon, authenticated;
revoke all on function public.labwise_submit_answer(uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.labwise_next_turn(uuid) from public, anon, authenticated;
grant execute on function public.labwise_create_challenge(text[],text[],integer,text) to authenticated;
grant execute on function public.labwise_join_challenge(text) to authenticated;
grant execute on function public.labwise_list_challenges() to authenticated;
grant execute on function public.labwise_get_challenge(uuid) to authenticated;
grant execute on function public.labwise_get_turn(uuid) to authenticated;
grant execute on function public.labwise_submit_answer(uuid,integer,integer) to authenticated;
grant execute on function public.labwise_next_turn(uuid) to authenticated;

comment on table public.labwise_quiz_questions is 'Owner-seeded release metadata. No direct client access. No question text, choices, rationale or PDFs.';
comment on table labwise_private.challenges is 'Private two-member friendly quiz, expires after seven days; not a secure exam.';
notify pgrst, 'reload schema';
commit;
