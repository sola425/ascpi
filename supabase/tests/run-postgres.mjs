// Real PostgreSQL tests with no live project, credentials, host ports or npm
// packages. The official database container has networking disabled and is
// removed in finally. Never point these fixtures at an existing database.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { testChallengeConcurrency } from './challenge-concurrency.mjs';

const exec = promisify(execFile);
const directory = dirname(fileURLToPath(import.meta.url));
const container = `labwise-postgres-test-${process.pid}-${Date.now()}`;
const image = process.env.LABWISE_POSTGRES_IMAGE || 'postgres:17-bookworm';
const dockerEnv = { ...process.env };
for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[key];
const dockerPrefix = ['--host=unix:///var/run/docker.sock'];
const docker = (args, options = {}) => exec('docker', [...dockerPrefix, ...args], { env: dockerEnv, maxBuffer: 2 * 1024 * 1024, ...options });
const psql = ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'labwise_test_admin', '-d', 'labwise_test'];
const blank = { version: 1, clock: [0, 0], records: {}, saved: {}, reading: {}, prefs: {}, events: {}, game: { version: 1, checkpoint: null, runs: {} }, frenzy: {} };
const document = clock => ({ ...blank, clock: [clock, 0] });
const sqlJson = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const identity = suffix => `00000000-0000-0000-0000-${String(suffix).padStart(12, '0')}`;
const claim = suffix => `set local role authenticated; set local request.jwt.claim.sub = '${identity(suffix)}';`;
const write = (revision, value) => `public.labwise_write_progress(${revision}, ${sqlJson(value)})`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function sql(source) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [...dockerPrefix, ...psql], { env: dockerEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`PostgreSQL assertion failed (${code}): ${stderr.trim()}`)));
    child.stdin.on('error', reject);
    child.stdin.end(source);
  });
}

async function overlap(firstQuery, secondQuery) {
  const first = spawn('docker',[...dockerPrefix,...psql],{env:dockerEnv,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='',announce,fail,timer;
  const ready=new Promise((resolve,reject)=>{announce=resolve;fail=reject;});
  const completed=new Promise((resolve,reject)=>{
    first.on('error',error=>{fail(error);reject(error);});
    first.on('close',code=>{
      if(code===0)resolve(stdout);
      else{const error=new Error(`Overlapping PostgreSQL query failed (${code}): ${stderr.trim()}`);fail(error);reject(error);}
    });
  });
  completed.catch(()=>{});
  first.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.includes('READY:'))announce();});
  first.stderr.on('data',chunk=>{stderr+=chunk;});
  first.stdin.on('error',fail);
  first.stdin.end(`begin; ${firstQuery.before} select 'READY:' || (${firstQuery.expression})::text; select pg_catalog.pg_sleep(1); commit;`);
  try{
    await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Overlapping query never became ready.')),10000);})]);
    const secondResult=JSON.parse(await sql(`begin; ${secondQuery.before} select ${secondQuery.expression}; commit;`));
    const firstOutput=await completed;
    const firstResult=JSON.parse(firstOutput.split('\n').find(line=>line.startsWith('READY:')).slice('READY:'.length));
    return[firstResult,secondResult];
  }finally{clearTimeout(timer);if(first.exitCode===null)first.kill();}
}

async function concurrentWrite(suffix, revision, label) {
  // Writer one commits only after writer two has had time to reach its locked
  // row or uncommitted unique key. This exercises real blocking transactions.
  const first = spawn('docker', [...dockerPrefix, ...psql], { env: dockerEnv, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  let announce, fail;
  const ready = new Promise((resolve, reject) => { announce = resolve; fail = reject; });
  const completed = new Promise((resolve, reject) => {
    first.on('error', error => { fail(error); reject(error); });
    first.on('close', code => {
      if (code === 0) resolve(stdout);
      else {
        const error = new Error(`Concurrent PostgreSQL writer failed (${code}): ${stderr.trim()}`);
        fail(error); reject(error);
      }
    });
  });
  // Register rejection handling before waiting for readiness.
  completed.catch(() => {});
  first.stdout.on('data', chunk => {
    stdout += chunk;
    if (stdout.includes('READY:')) announce();
  });
  first.stderr.on('data', chunk => { stderr += chunk; });
  first.stdin.on('error', fail);
  first.stdin.end(`begin; ${claim(suffix)} select 'READY:' || ${write(revision, document(10))}::text; select pg_catalog.pg_sleep(1); commit;`);
  let timer;
  try {
    await Promise.race([ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Concurrent writer never became ready.')), 10000); })]);
    const second = JSON.parse(await sql(`begin; ${claim(suffix)} select ${write(revision, document(20))}; commit;`));
    const firstOutput = await completed;
    const firstResult = JSON.parse(firstOutput.split('\n').find(line => line.startsWith('READY:')).slice('READY:'.length));
    assert.equal(firstResult.accepted, true, `${label}: first writer must be accepted`);
    assert.equal(second.accepted, false, `${label}: second writer must return a conflict`);
    assert.equal(firstResult.revision, revision + 1);
    assert.equal(second.revision, revision + 1);
    assert.deepEqual(second.document, document(10), `${label}: loser must receive the winner's document`);
    const final = JSON.parse(await sql(`begin; ${claim(suffix)} select public.labwise_read_progress(); commit;`));
    assert.equal(final.revision, revision + 1);
    assert.deepEqual(final.document, document(10), `${label}: stale writer must not overwrite progress`);
    process.stdout.write(`${label} passed.\n`);
  } finally {
    clearTimeout(timer);
    if (first.exitCode === null) first.kill();
  }
}

let created = false;
try {
  await docker(['info', '--format', '{{.ServerVersion}}']);
  process.stdout.write(`Starting disposable ${image} with no network or published ports.\n`);
  await docker([
    'run', '--detach', '--rm', '--name', container, '--network', 'none',
    '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,size=256m', '--memory', '512m',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=labwise_test_admin',
    '-e', 'POSTGRES_DB=labwise_test', image,
  ]);
  created = true;
  const deadline = Date.now() + 45000;
  for (;;) {
    try {
      await docker(['exec', container, 'pg_isready', '-U', 'labwise_test_admin', '-d', 'labwise_test']);
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await delay(250);
    }
  }
  await sql(await readFile(resolve(directory, 'bootstrap.sql'), 'utf8'));
  let combinedSetup;
  try { combinedSetup=await readFile(resolve(directory,'../setup.sql'),'utf8'); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
  if(combinedSetup){
    await sql(combinedSetup);
    await sql(combinedSetup);
    const registered=Number(await sql('select count(*) from public.labwise_quiz_questions;'));
    assert.equal(registered,2993,'The release setup must register all 2,993 eligible questions');
    const entryPoints=Number(await sql("select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('labwise_read_progress','labwise_write_progress','labwise_create_challenge','labwise_join_challenge','labwise_list_challenges','labwise_get_challenge','labwise_get_turn','labwise_submit_answer','labwise_next_turn');"));
    assert.equal(entryPoints,9,'The one-paste setup must install all nine authenticated RPCs');
    const releaseDigest=await sql('select distinct content_digest from public.labwise_quiz_questions;');
    assert.match(releaseDigest,/^[a-f0-9]{64}$/);
    const releaseChallenge=JSON.parse(await sql(`begin; ${claim(6)} select public.labwise_create_challenge('{}','{}',10,'${releaseDigest}'); commit;`));
    const releaseTurn=JSON.parse(await sql(`begin; ${claim(6)} select public.labwise_get_turn('${releaseChallenge.id}'); commit;`));
    const releaseAnswer=Number(await sql(`select answer_index from labwise_private.challenge_questions where challenge_id='${releaseChallenge.id}' and position=0;`));
    const releaseFeedback=JSON.parse(await sql(`begin; ${claim(6)} select public.labwise_submit_answer('${releaseChallenge.id}',0,${releaseAnswer}); commit;`));
    assert.equal(releaseFeedback.qid,releaseTurn.qid);
    assert.equal(releaseFeedback.you.score,100);
    assert.equal(releaseFeedback.lastAnswer.correct,true);
    process.stdout.write(`One-paste setup applied twice; ${registered} release questions registered.\n`);
  }
  const migration = await readFile(resolve(directory, '../migrations/202611070001_progress.sql'), 'utf8');
  await sql(migration);
  await sql(migration); // Rerunning owner setup must not erase existing schema/data.
  process.stdout.write('Migration applied twice successfully.\n');
  process.stdout.write(`${await sql(await readFile(resolve(directory, 'progress.sql'), 'utf8'))}\n`);
  await concurrentWrite(3, 0, 'Simultaneous first saves');
  await sql(`begin; ${claim(4)} select ${write(0, blank)}; commit;`);
  await concurrentWrite(4, 1, 'Concurrent updates at the same revision');
  const saved = JSON.parse(await sql(`begin; ${claim(4)} select public.labwise_read_progress(); commit;`));
  // Simulate a persisted document from the earlier eight-field schema.
  await sql("alter table public.labwise_progress drop constraint labwise_progress_document_check; update public.labwise_progress set document=document-'frenzy';");
  await sql(migration);
  const afterRerun = JSON.parse(await sql(`begin; ${claim(4)} select public.labwise_read_progress(); commit;`));
  assert.deepEqual(afterRerun, saved, 'Rerunning migration must preserve stored progress');
  process.stdout.write('Migration rerun preserved stored progress.\n');
  const challengesMigration = await readFile(resolve(directory, '../migrations/202611070002_challenges.sql'), 'utf8');
  await sql(challengesMigration);
  await sql(challengesMigration);
  process.stdout.write(`${await sql(await readFile(resolve(directory, 'challenges.sql'), 'utf8'))}\n`);
  await testChallengeConcurrency({sql,overlap,migration:challengesMigration});
  process.stdout.write('All PostgreSQL tests passed.\n');
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  if (created) {
    try { await docker(['rm', '--force', container]); }
    catch { process.stderr.write(`Could not remove test container ${container}; remove it manually.\n`); process.exitCode = 1; }
  }
}
