import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDuelClient, DUEL_RPCS } from '../duel-client.js';
import { createSupabaseRpcCaller } from '../supabase-client.js';

const ID = '9d03743d-9574-4f8f-958b-16ba8e6f006b';
const KEY = 'sb_publishable_browser_example';
const DIGEST = 'a'.repeat(64);
const options = { url:'https://project.supabase.co', publishableKey:KEY };
const player = overrides => ({ score:0, hearts:3, answered:0, phase:'ready', complete:false, ...overrides });
const summary = (overrides = {}) => ({
  id:ID, code:'ABCDEFGH', topics:['Hematology'], books:['success'], questionCount:10, contentDigest:DIGEST,
  createdAt:'2026-11-07T10:00:00Z', expiresAt:'2026-11-14T10:00:00Z', serverNow:'2026-11-07T10:01:00Z',
  status:'waiting', you:player(), opponent:null, result:null, ...overrides,
});
const turn = (overrides = {}) => summary({
  qid:'fixture-1', position:0, deadline:'2026-11-07T10:01:30Z', phase:'question', lastAnswer:null,
  you:player({phase:'question'}), ...overrides,
});
const feedback = () => turn({ phase:'feedback', deadline:null, you:player({phase:'feedback',score:100,answered:1}), lastAnswer:{qid:'fixture-1',index:0,choice:2,answerIndex:2,correct:true,timedOut:false,answeredAt:'2026-11-07T10:01:10Z'} });
const reply = (value,status=200) => ({ok:status>=200&&status<300,status,json:async()=>value});
function mock(responses, extra = {}) {
  const calls = [];
  const client = createDuelClient({...options,...extra,fetch:async(url,request)=>{
    calls.push({url,...request,body:JSON.parse(request.body)});
    const response = responses.shift();
    if(response instanceof Error)throw response;
    if(typeof response==='function')return response(url,request);
    assert.ok(response,'unexpected challenge request');
    return response;
  }});
  return {client,calls};
}

test('create uses only selected release settings and cannot submit an owner ID, score or credentials', async () => {
  const {client,calls}=mock([reply(summary())]);
  const result=await client.createChallenge('access-one',{topics:['Hematology','Hematology'],books:['success'],questionCount:10,contentDigest:DIGEST,user_id:'forged',score:9999,password:'private'});
  assert.equal(result.id,ID);
  assert.equal(calls[0].url,`${options.url}/rest/v1/rpc/labwise_create_challenge`);
  assert.deepEqual(calls[0].body,{topics:['Hematology'],books:['success'],question_count:10,content_digest:DIGEST});
  assert.equal(calls[0].headers.apikey,KEY);
  assert.equal(calls[0].headers.Authorization,'Bearer access-one');
  assert.equal(calls[0].credentials,'omit');
  assert.equal(calls[0].redirect,'error');
  assert.equal(JSON.stringify(calls[0].body).includes('private'),false);
  assert.deepEqual(Object.keys(client),['createChallenge','joinChallenge','listChallenges','getChallenge','getTurn','submitAnswer','nextTurn']);
});

test('join normalizes an invitation and summaries expose no opponent IDs, emails or answers', async () => {
  const raw=summary({status:'playing',opponent:{...player(),id:'private-user',email:'private@example.com',answerIndex:2},creator_id:'private-user',question_ids:['future'],answer_keys:[2]});
  const {client,calls}=mock([reply(raw)]);
  const result=await client.joinChallenge('access-one',' abcdefgh ');
  assert.deepEqual(calls[0].body,{invitation_code:'ABCDEFGH'});
  assert.deepEqual(result.opponent,player());
  for(const secret of ['private-user','private@example.com','answer_keys','future'])assert.equal(JSON.stringify(result).includes(secret),false);
});

test('summary polling uses its dedicated RPC and never starts a question in the client', async () => {
  const {client,calls}=mock([reply(summary())]);
  const result=await client.getChallenge('access-one',ID);
  assert.equal(result.you.phase,'ready');
  assert.equal('deadline' in result,false);
  assert.equal(calls[0].url.endsWith('/labwise_get_challenge'),true);
  assert.deepEqual(calls[0].body,{challenge_id:ID});
});

test('recent challenges come from the account with no local profile history or private opponent fields', async () => {
  const {client,calls}=mock([reply([summary({opponent:{...player(),email:'private@example.com',user_id:'private'}})]),reply([])]);
  const recent=await client.listChallenges('access-one');
  assert.equal(recent.length,1);
  assert.deepEqual(recent[0].opponent,player());
  assert.equal(JSON.stringify(recent).includes('private'),false);
  assert.equal(calls[0].url.endsWith('/labwise_list_challenges'),true);
  assert.deepEqual(calls[0].body,{});
  assert.deepEqual(await client.listChallenges('access-one'),[]);
});

test('turns retain the server clock and deadline; feedback appears only after an answer', async () => {
  const {client,calls}=mock([reply(turn()),reply(feedback())]);
  const active=await client.getTurn('access-one',ID);
  assert.equal(active.deadline,'2026-11-07T10:01:30Z');
  assert.equal(active.serverNow,'2026-11-07T10:01:00Z');
  assert.equal(active.lastAnswer,null);
  const answered=await client.submitAnswer('access-one',ID,0,2);
  assert.equal(answered.phase,'feedback');
  assert.equal(answered.deadline,null);
  assert.equal(answered.lastAnswer.answerIndex,2);
  assert.deepEqual(calls[1].body,{challenge_id:ID,question_index:0,choice:2});
  assert.equal('score' in calls[1].body,false);
});

test('null requests server timeout settlement and next sends no client clock, score or question order', async () => {
  const timed=turn({phase:'feedback',deadline:null,you:player({phase:'feedback',hearts:2,answered:1}),lastAnswer:{qid:'fixture-1',index:0,choice:null,answerIndex:2,correct:false,timedOut:true,answeredAt:'2026-11-07T10:01:30Z'}});
  const {client,calls}=mock([reply(timed),reply(turn({qid:'fixture-2',position:1,you:player({phase:'question',hearts:2,answered:1})}))]);
  const missed=await client.submitAnswer('access-one',ID,0,null);
  assert.equal(missed.lastAnswer.timedOut,true);
  assert.deepEqual(calls[0].body,{challenge_id:ID,question_index:0,choice:null});
  assert.equal((await client.nextTurn('access-one',ID)).position,1);
  assert.deepEqual(calls[1].body,{challenge_id:ID});
});

test('terminal feedback can be read untimed before the explicit results transition', async () => {
  const end=feedback();
  end.you=player({score:1000,answered:10,phase:'feedback',complete:true});
  end.position=9;end.lastAnswer.index=9;
  const {client}=mock([reply(end),reply({...end,phase:'complete',you:{...end.you,phase:'complete'}})]);
  assert.equal((await client.getTurn('access-one',ID)).you.complete,true);
  assert.equal((await client.nextTurn('access-one',ID)).phase,'complete');
});

test('unavailable invitations and rate limits use fixed errors and keep response details private', async () => {
  const {client}=mock([
    reply({errorCode:'unavailable',email:'private@example.com'}),
    reply({errorCode:'rate_limit',debug:'access-one'}),
    reply({errorCode:'content'}),
    reply({message:'private SQL and access-one'},403),
    reply({message:'private SQL and access-one'},401),
  ]);
  await assert.rejects(client.joinChallenge('access-one','ABCDEFGH'),{code:'unavailable'});
  await assert.rejects(client.joinChallenge('access-one','ABCDEFGH'),{code:'rate_limit'});
  await assert.rejects(client.createChallenge('access-one',{contentDigest:DIGEST}),{code:'content'});
  await assert.rejects(client.getChallenge('access-one',ID),error=>error.code==='unavailable'&&!error.message.includes('SQL')&&!error.message.includes('access-one'));
  await assert.rejects(client.getChallenge('access-one',ID),{code:'auth'});
});

test('network errors and timeouts never retry potentially committed answers', async () => {
  let signal;
  const {client,calls}=mock([new Error('private access-one'),(_url,request)=>{signal=request.signal;return new Promise(()=>{});} ],{timeoutMs:15});
  await assert.rejects(client.submitAnswer('access-one',ID,0,2),error=>error.code==='network'&&!error.message.includes('access-one'));
  await assert.rejects(client.submitAnswer('access-one',ID,0,2),{code:'timeout'});
  assert.equal(signal.aborted,true);
  assert.equal(calls.length,2);
});

test('invalid IDs, codes, choices, topic settings and release digests make no request', async () => {
  const {client,calls}=mock([]);
  await assert.rejects(client.getTurn('access-one','../other'),{code:'invalid'});
  await assert.rejects(client.joinChallenge('access-one','short'),{code:'invalid'});
  await assert.rejects(client.submitAnswer('access-one',ID,20,2),{code:'invalid'});
  await assert.rejects(client.submitAnswer('access-one',ID,0,6),{code:'invalid'});
  await assert.rejects(client.submitAnswer('access-one',ID,0,undefined),{code:'invalid'});
  await assert.rejects(client.createChallenge('access-one',{contentDigest:DIGEST,topics:['bad\nsubject']}),{code:'invalid'});
  await assert.rejects(client.createChallenge('access-one',{contentDigest:'unknown'}),{code:'invalid'});
  await assert.rejects(client.createChallenge('access-one',{contentDigest:DIGEST,questionCount:30}),{code:'invalid'});
  await assert.rejects(client.getChallenge(undefined,ID),{code:'invalid'});
  assert.equal(calls.length,0);
});

test('invalid or prematurely revealed server answers fail without accepting a local score', async () => {
  for(const malformed of [summary({you:player({score:9999})}),turn({deadline:null}),turn({lastAnswer:feedback().lastAnswer}),turn({phase:'feedback',deadline:null}),summary({opponent:{}})]){
    const {client}=mock([reply(malformed)]);
    await assert.rejects(client.getTurn('access-one',ID),{code:'server'});
  }
});

test('shared RPC transport cannot call a function outside the fixed whitelist', async () => {
  let calls=0;
  const caller=createSupabaseRpcCaller({...options,fetch:async()=>{calls++;return reply({});}},DUEL_RPCS);
  await assert.rejects(caller('set_config','access-one',{}),{code:'invalid'});
  await assert.rejects(caller('labwise_write_progress','access-one',{}),{code:'invalid'});
  await assert.rejects(caller('../other','access-one',{}),{code:'invalid'});
  assert.equal(calls,0);
  assert.equal(Object.isFrozen(DUEL_RPCS),true);
});
