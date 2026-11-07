\set ON_ERROR_STOP on
begin;
insert into auth.users(id)
  select ('00000000-0000-0000-0000-' || pg_catalog.lpad(g::text,12,'0'))::uuid from pg_catalog.generate_series(100,140) g;
insert into public.labwise_quiz_questions(id,topic,book_id,answer_index,option_count,content_digest)
  select 'fixture-' || g, case when g <= 20 then 'Hematology' else 'Chemistry' end,
    case when g % 2 = 1 then 'success' else 'boc7' end, (g % 4)::smallint, 4, pg_catalog.repeat('a',64)
  from pg_catalog.generate_series(1,40) g;

do $$
declare
  function_oid regprocedure;
begin
  foreach function_oid in array array[
    'public.labwise_create_challenge(text[],text[],integer,text)'::regprocedure,
    'public.labwise_join_challenge(text)'::regprocedure,
    'public.labwise_list_challenges()'::regprocedure,
    'public.labwise_get_challenge(uuid)'::regprocedure,
    'public.labwise_get_turn(uuid)'::regprocedure,
    'public.labwise_submit_answer(uuid,integer,integer)'::regprocedure,
    'public.labwise_next_turn(uuid)'::regprocedure
  ] loop
    if not exists(select 1 from pg_catalog.pg_proc where oid = function_oid and prosecdef and proconfig @> array['search_path=""']) then raise exception 'Challenge RPC must use a pinned SECURITY DEFINER entry point.'; end if;
    if pg_catalog.has_function_privilege('anon',function_oid,'execute') or not pg_catalog.has_function_privilege('authenticated',function_oid,'execute') then raise exception 'Challenge RPC grants are not authenticated-only.'; end if;
  end loop;
  if pg_catalog.has_schema_privilege('authenticated','labwise_private','usage') or pg_catalog.has_table_privilege('authenticated','public.labwise_quiz_questions','select,insert,update,delete') then raise exception 'Private keys or state have client grants.'; end if;
end;
$$;

-- Main challenge has exactly ten registered questions in the selected scope.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000101';
do $$
declare r jsonb; challenge_key uuid;
begin
  r := public.labwise_create_challenge(array['Hematology'],array['success'],10,pg_catalog.repeat('a',64));
  challenge_key := (r ->> 'id')::uuid;
  if r ->> 'status' <> 'waiting' or r -> 'you' ->> 'phase' <> 'ready' or r -> 'opponent' <> 'null'::jsonb or r ? 'qid' or r::text like '%answerIndex%' then raise exception 'Creation exposed a question/key or started the timer.'; end if;
  if r ->> 'code' !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' then raise exception 'Invitation code is not eight base32 characters.'; end if;
  if (r ->> 'expiresAt')::timestamptz - (r ->> 'createdAt')::timestamptz <> interval '7 days' then raise exception 'Challenge expiry is not seven days.'; end if;
  if (select count(*) from labwise_private.challenge_questions q where q.challenge_id = challenge_key) <> 10 then raise exception 'Question snapshot length is wrong.'; end if;
  if exists(select 1 from labwise_private.challenge_questions q join public.labwise_quiz_questions release on release.id = q.question_id where q.challenge_id = challenge_key and (release.topic <> 'Hematology' or release.book_id <> 'success')) then raise exception 'Question selection escaped its scope.'; end if;
  perform pg_catalog.set_config('labwise_test.challenge_id',challenge_key::text,true);
  perform pg_catalog.set_config('labwise_test.challenge_code',r ->> 'code',true);
  r := public.labwise_join_challenge(pg_catalog.current_setting('labwise_test.challenge_code'));
  if r ->> 'status' <> 'waiting' or r -> 'opponent' <> 'null'::jsonb or (select count(*) from labwise_private.challenge_players p where p.challenge_id=challenge_key) <> 1 then raise exception 'Creator joined themselves as their opponent.'; end if;
  if pg_catalog.jsonb_array_length(public.labwise_list_challenges()) <> 1 then raise exception 'Creator cannot find their challenge from another device.'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true);
  r := public.labwise_join_challenge(pg_catalog.lower(r ->> 'code'));
  if r ->> 'status' <> 'playing' or r -> 'you' ->> 'phase' <> 'ready' or r -> 'opponent' ->> 'phase' <> 'ready' then raise exception 'Join should add exactly one unstarted friend.'; end if;
  r := public.labwise_join_challenge(pg_catalog.current_setting('labwise_test.challenge_code'));
  if r ->> 'id' <> challenge_key::text or (select count(*) from labwise_private.challenge_players p where p.challenge_id = challenge_key) <> 2 then raise exception 'Repeated join was not idempotent.'; end if;
  if public.labwise_list_challenges() -> 0 ->> 'id' <> challenge_key::text then raise exception 'Joining friend cannot resume from the account list.'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000103',true);
  if public.labwise_join_challenge(pg_catalog.current_setting('labwise_test.challenge_code')) <> '{"errorCode":"unavailable"}'::jsonb then raise exception 'A third member joined a full challenge.'; end if;
  if (select join_count from labwise_private.challenge_limits where user_id = '00000000-0000-0000-0000-000000000103') <> 1 then raise exception 'Failed joins must count toward the attempt limit.'; end if;
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000103';
do $$
declare challenge_key uuid := pg_catalog.current_setting('labwise_test.challenge_id')::uuid;
begin
  if public.labwise_list_challenges() <> '[]'::jsonb then raise exception 'Outsider listed another account''s challenge.'; end if;
  begin perform public.labwise_get_challenge(challenge_key); raise exception 'Outsider read a challenge.'; exception when insufficient_privilege then null; end;
  begin perform public.labwise_get_turn(challenge_key); raise exception 'Outsider read a question.'; exception when insufficient_privilege then null; end;
  begin perform public.labwise_submit_answer(challenge_key,0,0); raise exception 'Outsider submitted an answer.'; exception when insufficient_privilege then null; end;
  begin perform public.labwise_next_turn(challenge_key); raise exception 'Outsider advanced a turn.'; exception when insufficient_privilege then null; end;
  begin perform * from public.labwise_quiz_questions; raise exception 'Client read the answer registry.'; exception when insufficient_privilege then null; end;
  begin perform * from labwise_private.challenges; raise exception 'Client read private challenge rows.'; exception when insufficient_privilege then null; end;
  begin perform * from labwise_private.challenge_questions; raise exception 'Client read private snapshot keys.'; exception when insufficient_privilege then null; end;
  begin perform labwise_private.grade_answer(challenge_key,'00000000-0000-0000-0000-000000000101',0,false,pg_catalog.clock_timestamp()); raise exception 'Client invoked a private grading helper.'; exception when insufficient_privilege then null; end;
end;
$$;
set local request.jwt.claim.sub = '';
do $$
begin
  begin perform public.labwise_create_challenge('{}','{}',10,pg_catalog.repeat('a',64)); raise exception 'Missing UID created a challenge.'; exception when insufficient_privilege then null; end;
  begin perform public.labwise_join_challenge('ABCDEFGH'); raise exception 'Missing UID joined a challenge.'; exception when insufficient_privilege then null; end;
  begin perform public.labwise_list_challenges(); raise exception 'Missing UID listed challenges.'; exception when insufficient_privilege then null; end;
end;
$$;
set local role anon;
do $$
begin
  begin perform public.labwise_create_challenge('{}','{}',10,pg_catalog.repeat('a',64)); raise exception 'Anonymous role created a challenge.'; exception when insufficient_privilege then null; end;
  begin perform public.labwise_join_challenge('ABCDEFGH'); raise exception 'Anonymous role joined a challenge.'; exception when insufficient_privilege then null; end;
  begin perform public.labwise_list_challenges(); raise exception 'Anonymous role listed challenges.'; exception when insufficient_privilege then null; end;
  begin perform public.labwise_get_turn(pg_catalog.current_setting('labwise_test.challenge_id')::uuid); raise exception 'Anonymous role read a turn.'; exception when insufficient_privilege then null; end;
end;
$$;
reset role;

do $$
declare
  challenge_key uuid := pg_catalog.current_setting('labwise_test.challenge_id')::uuid;
  first jsonb;
  r jsonb;
  answer integer;
  qid text;
  old_deadline timestamptz;
begin
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);
  first := public.labwise_get_turn(challenge_key);
  if first ->> 'phase' <> 'question' or first -> 'position' <> '0'::jsonb or first -> 'lastAnswer' <> 'null'::jsonb or first::text like '%answerIndex%' then raise exception 'Unanswered turn leaked an answer or has the wrong phase.'; end if;
  if (first ->> 'deadline')::timestamptz - (first ->> 'serverNow')::timestamptz <> interval '30 seconds' then raise exception 'Question deadline is not thirty server seconds.'; end if;
  if public.labwise_get_turn(challenge_key) ->> 'deadline' <> first ->> 'deadline' then raise exception 'Opening the turn twice reset its deadline.'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true);
  if public.labwise_get_turn(challenge_key) ->> 'qid' <> first ->> 'qid' then raise exception 'Players received different question order.'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);
  select q.answer_index into answer from labwise_private.challenge_questions q where q.challenge_id = challenge_key and q.position = 0;
  r := public.labwise_submit_answer(challenge_key,0,answer);
  if r -> 'you' -> 'score' <> '100'::jsonb or r -> 'you' -> 'hearts' <> '3'::jsonb or r ->> 'phase' <> 'feedback' or r -> 'deadline' <> 'null'::jsonb or r -> 'lastAnswer' -> 'answerIndex' <> pg_catalog.to_jsonb(answer) then raise exception 'Registered correct answer was not graded once.'; end if;
  r := public.labwise_submit_answer(challenge_key,0,(answer+1)%4);
  if r -> 'you' -> 'score' <> '100'::jsonb or r -> 'you' -> 'hearts' <> '3'::jsonb or (select count(*) from labwise_private.challenge_answers a where a.challenge_id=challenge_key and a.user_id='00000000-0000-0000-0000-000000000101') <> 1 then raise exception 'Duplicate answer changed the score or hearts.'; end if;
  r := public.labwise_next_turn(challenge_key);
  old_deadline := (r ->> 'deadline')::timestamptz;
  if r -> 'position' <> '1'::jsonb or r -> 'lastAnswer' <> 'null'::jsonb then raise exception 'Next did not start a fresh question.'; end if;
  r := public.labwise_next_turn(challenge_key);
  if r -> 'position' <> '1'::jsonb or (r ->> 'deadline')::timestamptz <> old_deadline then raise exception 'Duplicate Next skipped a question or extended its clock.'; end if;
  r := public.labwise_submit_answer(challenge_key,0,answer);
  if r ->> 'phase' <> 'question' or r -> 'position' <> '1'::jsonb or r -> 'you' -> 'score' <> '100'::jsonb then raise exception 'A stale answer changed the next turn.'; end if;
  r := public.labwise_submit_answer(challenge_key,1,null);
  if r ->> 'phase' <> 'question' or r -> 'you' -> 'hearts' <> '3'::jsonb then raise exception 'Client asserted a timeout before the server deadline.'; end if;
  update labwise_private.challenge_players p set deadline=pg_catalog.clock_timestamp()-interval '1 second' where p.challenge_id=challenge_key and p.user_id='00000000-0000-0000-0000-000000000101';
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true);
  r := public.labwise_get_challenge(challenge_key);
  if r -> 'opponent' -> 'hearts' <> '2'::jsonb or r::text like '%answerIndex%' or r ? 'lastAnswer' then raise exception 'Polling did not settle the opponent timeout privately.'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);
  r := public.labwise_get_turn(challenge_key);
  if r ->> 'phase' <> 'feedback' or r -> 'lastAnswer' -> 'timedOut' <> 'true'::jsonb or r -> 'lastAnswer' -> 'choice' <> 'null'::jsonb or r -> 'you' -> 'hearts' <> '2'::jsonb then raise exception 'Timeout was not graded once as an untimed feedback state.'; end if;
  if public.labwise_get_turn(challenge_key) -> 'you' -> 'hearts' <> '2'::jsonb then raise exception 'Repeated timeout read lost another heart.'; end if;
  r := public.labwise_next_turn(challenge_key);
  qid := r ->> 'qid';
  select q.answer_index into answer from labwise_private.challenge_questions q where q.challenge_id=challenge_key and q.position=2;
  update public.labwise_quiz_questions q set answer_index=(q.answer_index+1)%4,enabled=false where q.id=qid;
  r := public.labwise_submit_answer(challenge_key,2,answer);
  if r -> 'lastAnswer' -> 'correct' <> 'true'::jsonb or r -> 'you' -> 'score' <> '200'::jsonb then raise exception 'Registry maintenance changed a live snapshot key.'; end if;
  r := public.labwise_next_turn(challenge_key);
  select q.answer_index into answer from labwise_private.challenge_questions q where q.challenge_id=challenge_key and q.position=3;
  r := public.labwise_submit_answer(challenge_key,3,(answer+1)%4);
  if r -> 'you' -> 'hearts' <> '1'::jsonb then raise exception 'Wrong answer did not lose exactly one heart.'; end if;
  perform public.labwise_next_turn(challenge_key);
  update labwise_private.challenge_players p set deadline=pg_catalog.clock_timestamp()-interval '1 second' where p.challenge_id=challenge_key and p.user_id='00000000-0000-0000-0000-000000000101';
  r := public.labwise_submit_answer(challenge_key,4,null);
  if r -> 'you' -> 'hearts' <> '0'::jsonb or r -> 'you' -> 'complete' <> 'true'::jsonb or r ->> 'phase' <> 'feedback' or r -> 'you' -> 'answered' <> '5'::jsonb then raise exception 'Three misses did not end the round with final feedback.'; end if;
  r := public.labwise_next_turn(challenge_key);
  if r ->> 'phase' <> 'complete' or r -> 'deadline' <> 'null'::jsonb then raise exception 'Game-over Next started another timed question.'; end if;
  if public.labwise_next_turn(challenge_key) -> 'you' -> 'hearts' <> '0'::jsonb then raise exception 'Repeated game-over transition changed the state.'; end if;
end;
$$;

do $$
declare challenge_key uuid := pg_catalog.current_setting('labwise_test.challenge_id')::uuid; answer integer; i integer; r jsonb;
begin
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true);
  for i in 0..2 loop
    select q.answer_index into answer from labwise_private.challenge_questions q where q.challenge_id=challenge_key and q.position=i;
    r := public.labwise_submit_answer(challenge_key,i,(answer+1)%4);
    if i < 2 then perform public.labwise_next_turn(challenge_key); end if;
  end loop;
  if r ->> 'status' <> 'complete' or r ->> 'result' <> 'loss' then raise exception 'Finished lower score was not a loss.'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);
  r := public.labwise_get_challenge(challenge_key);
  if r ->> 'result' <> 'win' or r -> 'you' -> 'score' <> '200'::jsonb or r -> 'opponent' -> 'score' <> '0'::jsonb then raise exception 'Winner summary was not based on authoritative scores.'; end if;
  update labwise_private.challenges h set expires_at=pg_catalog.clock_timestamp()-interval '1 second' where h.id=challenge_key;
  r := public.labwise_get_turn(challenge_key);
  if r ->> 'status' <> 'expired' or r -> 'qid' <> 'null'::jsonb or r -> 'result' <> 'null'::jsonb then raise exception 'Expired challenge exposed a playable question.'; end if;
  if public.labwise_join_challenge(pg_catalog.current_setting('labwise_test.challenge_code')) ->> 'id' <> challenge_key::text then raise exception 'Existing member cannot recover their expired summary by code.'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000103',true);
  if public.labwise_join_challenge(pg_catalog.current_setting('labwise_test.challenge_code')) <> '{"errorCode":"unavailable"}'::jsonb then raise exception 'Expired invitation was reusable.'; end if;
end;
$$;

-- Ten correct answers finish at the question limit; equal scores are a draw.
do $$
declare r jsonb; challenge_key uuid; code text; uid uuid; i integer; answer integer;
begin
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000111',true);
  r := public.labwise_create_challenge(array['Hematology','Chemistry'],array['success','boc7'],10,pg_catalog.repeat('a',64)); challenge_key := (r ->> 'id')::uuid; code := r ->> 'code';
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000112',true); perform public.labwise_join_challenge(code);
  foreach uid in array array['00000000-0000-0000-0000-000000000111'::uuid,'00000000-0000-0000-0000-000000000112'::uuid] loop
    perform pg_catalog.set_config('request.jwt.claim.sub',uid::text,true); perform public.labwise_get_turn(challenge_key);
    for i in 0..9 loop
      select q.answer_index into answer from labwise_private.challenge_questions q where q.challenge_id=challenge_key and q.position=i;
      r := public.labwise_submit_answer(challenge_key,i,answer);
      if i < 9 then perform public.labwise_next_turn(challenge_key); end if;
    end loop;
    if r -> 'you' -> 'score' <> '1000'::jsonb or r -> 'you' -> 'hearts' <> '3'::jsonb or r -> 'you' -> 'complete' <> 'true'::jsonb or r ->> 'phase' <> 'feedback' then raise exception 'Question limit or 100-per-correct scoring is wrong.'; end if;
  end loop;
  if r ->> 'result' <> 'draw' then raise exception 'Equal final scores are not a draw.'; end if;
  delete from auth.users where auth.users.id='00000000-0000-0000-0000-000000000112';
  if exists(select 1 from labwise_private.challenges h where h.id=challenge_key) or exists(select 1 from labwise_private.challenge_answers a where a.challenge_id=challenge_key) or exists(select 1 from labwise_private.challenge_questions q where q.challenge_id=challenge_key) then raise exception 'Member deletion did not cascade through private quiz data.'; end if;
end;
$$;

do $$
declare r jsonb; i integer;
begin
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000113',true);
  r := public.labwise_create_challenge('{}','{}',20,pg_catalog.repeat('a',64));
  if r -> 'questionCount' <> '20'::jsonb then raise exception 'Twenty-question setup was not accepted.'; end if;
  if public.labwise_create_challenge('{}','{}',10,pg_catalog.repeat('b',64)) <> '{"errorCode":"content"}'::jsonb then raise exception 'A mismatched release digest selected questions.'; end if;
  if public.labwise_create_challenge(array['Hematology','unregistered subject'],'{}',10,pg_catalog.repeat('a',64)) <> '{"errorCode":"content"}'::jsonb then raise exception 'Unknown subjects were stored as challenge metadata.'; end if;
  if public.labwise_create_challenge('{}',array['success','unregistered source'],10,pg_catalog.repeat('a',64)) <> '{"errorCode":"content"}'::jsonb then raise exception 'Unknown sources were stored as challenge metadata.'; end if;
  begin perform public.labwise_create_challenge('{}','{}',30,pg_catalog.repeat('a',64)); raise exception 'Unsupported question count accepted.'; exception when invalid_parameter_value then null; end;
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000120',true);
  for i in 1..5 loop
    r := public.labwise_create_challenge('{}','{}',10,pg_catalog.repeat('a',64));
    if not r ? 'id' then raise exception 'Creation limit blocked a permitted challenge.'; end if;
  end loop;
  if public.labwise_create_challenge('{}','{}',10,pg_catalog.repeat('a',64)) <> '{"errorCode":"rate_limit"}'::jsonb then raise exception 'Hourly creation limit was not enforced.'; end if;
  update labwise_private.challenges h set created_at=pg_catalog.clock_timestamp()-interval '2 hours' where h.creator_id='00000000-0000-0000-0000-000000000120';
  update labwise_private.challenge_limits set create_window=pg_catalog.clock_timestamp()-interval '2 hours',create_count=0,create_day_count=20 where user_id='00000000-0000-0000-0000-000000000120';
  insert into labwise_private.challenges(code,creator_id,topics,books,question_count,content_digest,created_at)
    select 'RATEAAA' || pg_catalog.substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',g,1), '00000000-0000-0000-0000-000000000120', '{}','{}',10,pg_catalog.repeat('a',64),pg_catalog.clock_timestamp()-interval '2 hours' from pg_catalog.generate_series(1,15) g;
  if public.labwise_create_challenge('{}','{}',10,pg_catalog.repeat('a',64)) <> '{"errorCode":"rate_limit"}'::jsonb then raise exception 'Daily creation limit was not enforced.'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000121',true);
  for i in 1..30 loop
    if public.labwise_join_challenge('INVALID!') <> '{"errorCode":"unavailable"}'::jsonb then raise exception 'Invalid invitation was not rejected generically.'; end if;
  end loop;
  if public.labwise_join_challenge('INVALID!') <> '{"errorCode":"rate_limit"}'::jsonb then raise exception 'Failed invitation attempts bypassed the hourly join limit.'; end if;
  update labwise_private.challenge_limits set join_window=pg_catalog.clock_timestamp()-interval '2 hours',join_count=0,join_day_count=100 where user_id='00000000-0000-0000-0000-000000000121';
  if public.labwise_join_challenge('INVALID!') <> '{"errorCode":"rate_limit"}'::jsonb then raise exception 'Daily join limit was not enforced.'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000122',true);
  for i in 1..5 loop
    if public.labwise_create_challenge('{}','{}',10,pg_catalog.repeat('c',64)) <> '{"errorCode":"content"}'::jsonb then raise exception 'Unavailable release should reject generically.'; end if;
  end loop;
  if public.labwise_create_challenge('{}','{}',10,pg_catalog.repeat('c',64)) <> '{"errorCode":"rate_limit"}'::jsonb then raise exception 'Failed release selections bypassed creation attempt limits.'; end if;
end;
$$;
insert into labwise_private.challenges(code,creator_id,topics,books,question_count,content_digest,created_at)
  select 'PAGEAAA' || pg_catalog.substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',g,1), '00000000-0000-0000-0000-000000000140', '{}','{}',10,pg_catalog.repeat('a',64),pg_catalog.clock_timestamp()-g*interval '1 minute' from pg_catalog.generate_series(1,21) g;
insert into labwise_private.challenge_players(challenge_id,user_id)
  select h.id,h.creator_id from labwise_private.challenges h where h.creator_id='00000000-0000-0000-0000-000000000140';
do $$
declare r jsonb; oldest uuid;
begin
  perform pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000140',true);
  r := public.labwise_list_challenges();
  select h.id into oldest from labwise_private.challenges h where h.creator_id='00000000-0000-0000-0000-000000000140' order by h.created_at,h.id limit 1;
  if pg_catalog.jsonb_array_length(r) <> 20 or exists(select 1 from pg_catalog.jsonb_array_elements(r) item where item ->> 'id' = oldest::text) then raise exception 'Recent challenge list did not return only the latest twenty.'; end if;
  if (r -> 0 ->> 'createdAt')::timestamptz < (r -> 19 ->> 'createdAt')::timestamptz or r::text like '%answerIndex%' or r::text like '%000000000140%' then raise exception 'List ordering or private summary fields are wrong.'; end if;
  if exists(select 1 from labwise_private.challenge_players p where p.user_id='00000000-0000-0000-0000-000000000140' and (p.phase <> 'ready' or p.deadline is not null)) then raise exception 'Listing a challenge started a timer.'; end if;
end;
$$;
commit;
\echo Private challenge grants, registered grading, deadlines, idempotence, three hearts, question limits, draws, expiry and rate limits passed.
