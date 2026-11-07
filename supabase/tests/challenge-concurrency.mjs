import assert from 'node:assert/strict';

const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const asUser = n => `set local role authenticated; set local request.jwt.claim.sub='${uid(n)}';`;
const call = (n,expression) => `begin; ${asUser(n)} select ${expression}; commit;`;

export async function testChallengeConcurrency({sql, overlap, migration}) {
  const created = JSON.parse(await sql(call(130,"public.labwise_create_challenge('{}','{}',10,repeat('a',64))")));
  const id = created.id, code = created.code;
  assert.match(id,/^[a-f0-9-]{36}$/);
  assert.match(code,/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  const joined = await overlap(
    {before:asUser(131),expression:`public.labwise_join_challenge('${code}')`},
    {before:asUser(132),expression:`public.labwise_join_challenge('${code}')`},
  );
  assert.equal(joined[0].id,id);
  assert.deepEqual(joined[1],{errorCode:'unavailable'});
  assert.equal(await sql(`select count(*) from labwise_private.challenge_players where challenge_id='${id}';`),'2');
  await assert.rejects(sql(call(132,`public.labwise_get_turn('${id}')`)),/Challenge unavailable/);
  process.stdout.write('Concurrent invitation claims admit exactly one friend.\n');

  const opened = JSON.parse(await sql(call(130,`public.labwise_get_turn('${id}')`)));
  const answer = Number(await sql(`select answer_index from labwise_private.challenge_questions where challenge_id='${id}' and position=0;`));
  const answers = await overlap(
    {before:asUser(130),expression:`public.labwise_submit_answer('${id}',0,${answer})`},
    {before:asUser(130),expression:`public.labwise_submit_answer('${id}',0,${(answer+1)%4})`},
  );
  for(const result of answers) {
    assert.equal(result.qid,opened.qid);
    assert.equal(result.you.score,100);
    assert.equal(result.you.hearts,3);
    assert.equal(result.you.answered,1);
    assert.equal(result.lastAnswer.choice,answer);
  }
  assert.equal(await sql(`select count(*) from labwise_private.challenge_answers where challenge_id='${id}' and user_id='${uid(130)}';`),'1');
  process.stdout.write('Concurrent conflicting answer submissions grade once.\n');

  await sql(call(130,`public.labwise_next_turn('${id}')`));
  const secondAnswer=Number(await sql(`select answer_index from labwise_private.challenge_questions where challenge_id='${id}' and position=1;`));
  await sql(`update labwise_private.challenge_players set deadline=clock_timestamp()-interval '1 second' where challenge_id='${id}' and user_id='${uid(130)}';`);
  const timed = await overlap(
    {before:asUser(130),expression:`public.labwise_get_turn('${id}')`},
    {before:asUser(130),expression:`public.labwise_submit_answer('${id}',1,${secondAnswer})`},
  );
  for(const result of timed) {
    assert.equal(result.phase,'feedback');
    assert.equal(result.lastAnswer.timedOut,true);
    assert.equal(result.lastAnswer.correct,false);
    assert.equal(result.lastAnswer.choice,null);
    assert.equal(result.you.score,100);
    assert.equal(result.you.hearts,2);
    assert.equal(result.you.answered,2);
  }
  process.stdout.write('Concurrent timeout and answer settlement loses one heart.\n');
  const before = JSON.parse(await sql(call(130,`public.labwise_get_turn('${id}')`)));
  await sql(migration);
  const after = JSON.parse(await sql(call(130,`public.labwise_get_turn('${id}')`)));
  delete before.serverNow;delete after.serverNow;
  assert.deepEqual(after,before);
  process.stdout.write('Challenge migration rerun preserves live snapshots, scores and deadlines.\n');
}
