// Private friend challenges use the account transport, never progress backups
// or client-asserted scores. Only these seven server RPCs are reachable here.
import { createSupabaseRpcCaller, SupabaseError } from './supabase-client.js';

export const DUEL_RPCS = Object.freeze([
  'labwise_create_challenge', 'labwise_join_challenge', 'labwise_list_challenges', 'labwise_get_challenge',
  'labwise_get_turn', 'labwise_submit_answer', 'labwise_next_turn',
]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PHASES = ['ready', 'question', 'feedback', 'complete'];
const invalid = message => new SupabaseError('invalid', message);
const unreadable = () => new SupabaseError('server', 'The friend challenge could not be read. Try again.');

function strings(value, limit, length) {
  if (!Array.isArray(value) || value.length > limit || value.some(v => typeof v !== 'string' || !v.length || v.length > length || /[\u0000-\u001f\u007f]/.test(v))) throw invalid('Choose valid subjects and sources for this challenge.');
  return [...new Set(value)].sort();
}
function id(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw invalid('This challenge link is invalid.');
  return value;
}
function player(value, count) {
  if (!object(value) || !integer(value.score) || value.score % 100 || value.score > count * 100 || !integer(value.hearts) || value.hearts > 3 || !integer(value.answered) || value.answered > count || !PHASES.includes(value.phase) || typeof value.complete !== 'boolean' || value.score > value.answered * 100) throw unreadable();
  return { score: value.score, hearts: value.hearts, answered: value.answered, phase: value.phase, complete: value.complete };
}
function summary(value) {
  if (!object(value) || typeof value.id !== 'string' || !UUID.test(value.id) || typeof value.code !== 'string' || !CODE.test(value.code) || ![10,20].includes(value.questionCount) || typeof value.contentDigest !== 'string' || !DIGEST.test(value.contentDigest)
    || !timestamp(value.createdAt) || !timestamp(value.expiresAt) || !timestamp(value.serverNow) || !['waiting','playing','complete','expired'].includes(value.status) || ![null,'win','loss','draw'].includes(value.result)) throw unreadable();
  let topics, books;
  try { topics = strings(value.topics,50,120); books = strings(value.books,8,80); } catch { throw unreadable(); }
  return {
    id: value.id, code: value.code, topics, books, questionCount: value.questionCount, contentDigest: value.contentDigest,
    createdAt: value.createdAt, expiresAt: value.expiresAt, serverNow: value.serverNow, status: value.status,
    you: player(value.you,value.questionCount), opponent: value.opponent === null ? null : player(value.opponent,value.questionCount), result: value.result,
  };
}
function turn(value) {
  const result = summary(value);
  if (!integer(value.position) || value.position >= result.questionCount || !['question','feedback','complete'].includes(value.phase)
    || (value.qid !== null && (typeof value.qid !== 'string' || !value.qid.length || value.qid.length > 200))
    || (value.deadline !== null && !timestamp(value.deadline)) || (value.phase === 'question' && value.deadline === null)
    || (value.phase !== 'question' && value.deadline !== null) || (value.phase !== 'complete' && value.qid === null)) throw unreadable();
  let lastAnswer = null;
  if (value.lastAnswer !== null) {
    const a = value.lastAnswer;
    if (!object(a) || value.phase === 'question' || typeof a.qid !== 'string' || !a.qid || a.qid.length > 200 || !integer(a.index) || a.index !== value.position || !integer(a.answerIndex) || a.answerIndex > 5
      || (a.choice !== null && (!integer(a.choice) || a.choice > 5)) || typeof a.correct !== 'boolean' || typeof a.timedOut !== 'boolean' || !timestamp(a.answeredAt)
      || (value.qid !== null && a.qid !== value.qid)) throw unreadable();
    lastAnswer = { qid:a.qid, index:a.index, choice:a.choice, answerIndex:a.answerIndex, correct:a.correct, timedOut:a.timedOut, answeredAt:a.answeredAt };
  } else if (value.phase === 'feedback') throw unreadable();
  return { ...result, qid:value.qid, position:value.position, deadline:value.deadline, phase:value.phase, lastAnswer };
}

export function createDuelClient(options = {}) {
  const rpc = createSupabaseRpcCaller(options, DUEL_RPCS);
  async function call(name, accessToken, body, read = summary) {
    let value;
    try { value = await rpc(name,accessToken,body); }
    catch (error) {
      if (error?.status === 403) throw new SupabaseError('unavailable','This private challenge is unavailable.',403);
      if (error?.status === 400) throw invalid('The challenge settings or answer are invalid.');
      throw error;
    }
    if (value?.errorCode === 'unavailable') throw new SupabaseError('unavailable','This invitation is unavailable, full or expired.');
    if (value?.errorCode === 'rate_limit') throw new SupabaseError('rate_limit','Too many challenge requests. Wait before trying again.');
    if (value?.errorCode === 'content') throw new SupabaseError('content','This app version or subject selection has too few registered questions. Update the app or choose more subjects.');
    return read(value);
  }
  return Object.freeze({
    async createChallenge(accessToken, { topics = [], books = [], questionCount = 10, contentDigest } = {}) {
      if (![10,20].includes(questionCount) || typeof contentDigest !== 'string' || !DIGEST.test(contentDigest)) throw invalid('Choose 10 or 20 questions from the current app release.');
      return call('labwise_create_challenge',accessToken,{ topics:strings(topics,50,120), books:strings(books,8,80), question_count:questionCount, content_digest:contentDigest });
    },
    async joinChallenge(accessToken, value) {
      const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
      if (!CODE.test(code)) throw invalid('Enter the eight-character invitation code.');
      return call('labwise_join_challenge',accessToken,{ invitation_code:code });
    },
    async listChallenges(accessToken) {
      return call('labwise_list_challenges',accessToken,{},value=>{
        if(!Array.isArray(value)||value.length>20)throw unreadable();
        return value.map(summary);
      });
    },
    async getChallenge(accessToken, challengeId) {
      return call('labwise_get_challenge',accessToken,{ challenge_id:id(challengeId) });
    },
    async getTurn(accessToken, challengeId) {
      return call('labwise_get_turn',accessToken,{ challenge_id:id(challengeId) },turn);
    },
    async submitAnswer(accessToken, challengeId, index, choice) {
      if (!integer(index) || index > 19 || (choice !== null && (!integer(choice) || choice > 5))) throw invalid('Choose a valid answer for this question.');
      return call('labwise_submit_answer',accessToken,{ challenge_id:id(challengeId), question_index:index, choice },turn);
    },
    async nextTurn(accessToken, challengeId) {
      return call('labwise_next_turn',accessToken,{ challenge_id:id(challengeId) },turn);
    },
  });
}
