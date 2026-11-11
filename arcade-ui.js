import {questionText} from './figures.js';
import {frenzySummary} from './frenzy.js';
import {icon} from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
const number = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const time = value => typeof value === 'number' ? value : Date.parse(value);
const points = value => number(value).toLocaleString();
const button = (label, action, {primary = false, disabled = false, extra = ''} = {}) => `<button type="button" class="btn arcade-btn${primary ? ' primary' : ''}" data-action="${esc(action)}"${disabled ? ' disabled' : ''}${extra ? ` ${extra}` : ''}>${label}</button>`;
const heartIcon = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.2 4.4 13A5.2 5.2 0 0 1 12 5.9 5.2 5.2 0 0 1 19.6 13Z"/></svg>';

function hearts(value) {
  const count = clamp(number(value), 0, 3);
  return `<span class="arcade-hearts" role="img" aria-label="${count} of 3 hearts remaining">${[0, 1, 2].map(index => `<span class="arcade-heart${index >= count ? ' is-used' : ''}" aria-hidden="true">${heartIcon}</span>`).join('')}<span class="arcade-heart-count" aria-hidden="true">${count}<small>/3</small></span></span>`;
}
function clock(deadline, now) {
  const at = time(deadline), current = Number.isFinite(time(now)) ? time(now) : Date.now();
  const remaining = Number.isFinite(at) ? clamp(at - current, 0, 30000) : 0;
  const seconds = Math.ceil(remaining / 1000);
  return {seconds, html: `<div class="arcade-clock-box"><span class="arcade-clock" role="timer" aria-live="off" aria-label="${seconds} seconds remaining">${seconds}<small>s</small></span><span class="arcade-clock-label">of 30 seconds</span></div>`,
    bar: `<div class="arcade-timer-track${seconds <= 5 ? ' is-urgent' : ''}" role="progressbar" aria-label="Question time remaining" aria-valuemin="0" aria-valuemax="30" aria-valuenow="${seconds}"><span class="arcade-timer-bar" data-deadline="${Number.isFinite(at) ? at : 0}" style="width:${remaining / 300}%"></span></div>`};
}
function rules() {
  return `<div class="arcade-mode-rules" aria-label="Round rules"><div><strong>30<small>s</small></strong><span>each question</span></div><div><strong>3 ${heartIcon}</strong><span>hearts to start</span></div><div><strong>100</strong><span>per correct answer</span></div></div>`;
}
function topicLabel(topics) { return Array.isArray(topics) && topics.length ? topics.map(esc).join(' · ') : 'Mixed subjects'; }
function questionCard(q, voiceHTML, attribute, visualsHTML = '') {
  return `<article class="arcade-question"><div class="arcade-question-meta"><span class="badge">${esc(q.topic)}</span>${q.source ? `<span class="arcade-source">${esc(q.source)}</span>` : ''}</div><h2 class="question-text">${esc(questionText(q))}</h2>${visualsHTML}${q.teaching?.questionInPlainEnglish ? `<div class="plain-question"><strong>What this question is asking</strong><p>${esc(q.teaching.questionInPlainEnglish)}</p></div>` : ''}${voiceHTML || ''}<div class="arcade-options">${q.options.map((option, index) => `<button type="button" class="arcade-option" ${attribute}="${index}"><b aria-hidden="true">${String.fromCharCode(65 + index)}</b><span><span class="arcade-option-sr">Choice ${String.fromCharCode(65 + index)}: </span>${esc(option)}</span></button>`).join('')}</div></article>`;
}
function feedback(q, response, answerIndex, lessonHTML, {terminal = false, visualsHTML = ''} = {}) {
  if (!response) return '';
  const correct = response.correct === true, timedOut = response.timedOut === true;
  const answer = q?.options?.[answerIndex];
  const choice = response.choice;
  const selected = choice === null ? 'No answer before the deadline.' : q?.options?.[choice] === undefined ? 'Your answer was recorded.' : `Your choice: ${String.fromCharCode(65 + choice)} · ${q.options[choice]}`;
  const why = !correct && choice !== null ? q?.teaching?.optionExplanations?.[choice] : '';
  const title = correct ? 'That connection clicked.' : timedOut ? 'Time’s up. Take a look at the idea.' : 'An idea to bring back.';
  const explanation = lessonHTML || (q ? `<section class="arcade-rationale"><h2>Why this answer</h2><p>${esc(q.explanation || 'This collection does not include a separate explanation for this item.')}</p></section>` : `<section class="arcade-rationale"><h2>Your answer is saved.</h2><p>Refresh this Duel to load the question and its explanation.</p></section>`);
  return `<section class="arcade-feedback${correct ? ' is-correct' : ' is-missed'}" role="status" tabindex="-1"><span class="arcade-feedback-icon" aria-hidden="true">${icon(correct ? 'check' : timedOut ? 'refresh' : 'book')}</span><div><strong>${title}</strong><p>${answer === undefined ? `Answer ${String.fromCharCode(65 + answerIndex)} was recorded for this question.` : `Book’s answer: ${String.fromCharCode(65 + answerIndex)} · ${esc(answer)}`}</p>${!correct ? `<small>${terminal ? 'Your final explanation stays here to explore.' : 'One heart used. Read the explanation before you continue.'}</small>` : ''}</div><span class="arcade-response-score">${correct ? '+100' : '0'}<small>points</small></span></section>${q ? `<details class="arcade-question-again"><summary>Look at the question again</summary><p>${esc(questionText(q))}</p>${q.teaching?.questionInPlainEnglish ? `<p><strong>In plain words:</strong> ${esc(q.teaching.questionInPlainEnglish)}</p>` : ''}<p>${esc(selected)}</p>${why ? `<p class="arcade-choice-reason">${esc(why)}</p>` : ''}</details>` : ''}${visualsHTML}<div class="arcade-teaching">${explanation}</div>`;
}
function unavailable(message, actions) {
  return `<section class="arcade-empty"><span class="arcade-empty-icon" aria-hidden="true">${icon('book')}</span><h2>Your progress is kept.</h2><p>${esc(message)}</p><div class="arcade-button-row">${actions}</div></section>`;
}

/** Dialog content only; the app owns its checkbox and action handlers. */
export function arcadeSetup({mode = 'sprint', topics = [], selected = [], limit = 20} = {}) {
  const kind = mode === 'frenzy' ? 'frenzy' : mode === 'duel' ? 'duel' : 'sprint';
  const names = new Map();
  for (const topic of topics) if (topic && typeof topic.name === 'string' && topic.name && !names.has(topic.name)) names.set(topic.name, number(topic.count));
  const checked = new Set(Array.isArray(selected) ? selected : []);
  const count = [...names].reduce((total, [name, available]) => total + (checked.has(name) ? available : 0), 0);
  const size = kind === 'sprint' ? 5 : limit === 10 ? 10 : 20;
  const minimum = kind === 'sprint' ? 5 : kind === 'duel' ? size : 1;
  const label = kind === 'sprint' ? 'Lab Sprint' : kind === 'frenzy' ? 'Solo Frenzy' : 'Friend Duel';
  const intro = kind === 'sprint' ? 'Five questions, with room for explanations and memory checks.' : kind === 'frenzy' ? 'Keep the ideas coming. Every correct answer earns 100 points; a wrong answer or timeout uses one heart.' : 'Choose a shared set for you and one invited friend. Scores stay between the two of you.';
  const body = `<div class="arcade arcade-setup"><p class="arcade-setup-intro">${intro}</p>${kind === 'sprint' ? '' : rules()}<fieldset class="arcade-topic-picker"><legend>Choose your subjects</legend><div class="arcade-topic-controls">${button('Select all', 'topic-all')}${button('Clear', 'topic-clear')}</div><div class="arcade-topic-list">${[...names].map(([name, available]) => `<label class="arcade-topic${available ? '' : ' is-empty'}"><input type="checkbox" name="arcade-topic" value="${esc(name)}"${checked.has(name) && available ? ' checked' : ''}${available ? '' : ' disabled'}><span>${esc(name)}</span><small>${available.toLocaleString()}<span class="arcade-option-sr"> eligible questions</span></small></label>`).join('') || '<p>No short questions are available in this source. Choose another source to play.</p>'}</div></fieldset><div class="arcade-limit-field"><label for="arcade-limit">Questions this round</label><select id="arcade-limit"${kind === 'sprint' ? ' disabled' : ''}>${(kind === 'sprint' ? [5] : [10, 20]).map(value => `<option value="${value}"${value === size ? ' selected' : ''}>${kind === 'frenzy' ? 'Up to ' : ''}${value} questions</option>`).join('')}</select></div><p id="topic-count" class="arcade-count" role="status" aria-live="polite">${count.toLocaleString()} eligible short questions selected.${kind === 'sprint' ? ' Choose at least 5.' : kind === 'duel' ? ` Choose at least ${size} to fill the Duel.` : ' Your round ends at the last question or when all three hearts are used.'}</p>${kind === 'sprint' ? '' : '<p class="arcade-small-note">The clock pauses for explanations. While answering, leaving the app keeps the deadline running.</p>'}</div>`;
  return {title: `Choose your ${label} subjects`, body,
    footer: `<div class="arcade arcade-dialog-actions">${button('Cancel', 'close-dialog')}${button(kind === 'duel' ? 'Create invitation →' : `Start ${kind === 'sprint' ? 'Sprint' : 'Frenzy'} →`, 'mode-confirm', {primary: true, disabled: count < minimum, extra: `data-mode="${kind}"`})}</div>`};
}

export function renderFrenzy({progress, q, voiceHTML = '', visualsHTML = '', lessonHTML = ''} = {}) {
  const summary = frenzySummary(progress), active = summary.active;
  if (!active) return `<div class="arcade"><header class="arcade-header"><p class="eyebrow">SOLO FRENZY</p><h1 tabindex="-1">A quick round, a few fresh connections.</h1></header>${unavailable('Choose your subjects and start with three hearts. Every completed round stays in your progress.', button('Choose a round', 'frenzy-restart', {primary: true}) + button('Back to Play', 'arcade-hub'))}</div>`;
  const complete = active.phase === 'complete', answering = active.phase === 'question';
  const currentId = answering ? active.queue[active.index].id : summary.lastResponse?.id;
  const usableQuestion = q && q.id === currentId && Array.isArray(q.options) ? q : null;
  const title = complete ? 'Your Frenzy, finished.' : answering ? 'One question. Make the connection.' : 'Give this idea a moment.';
  const header = `<header class="arcade-header"><p class="eyebrow">SOLO FRENZY · ${complete ? 'ROUND COMPLETE' : `QUESTION ${active.index + 1} OF ${active.queue.length}`}</p><div class="arcade-topline"><h1 tabindex="-1">${title}</h1>${complete ? '' : button('Leave round', 'frenzy-leave')}</div><p class="arcade-subtitle">${topicLabel(active.topics)}</p></header>`;
  if (!usableQuestion) return `<div class="arcade">${header}${unavailable('This question is no longer in the active collection. Choose a new round to keep playing.', button('Choose a new round', 'frenzy-restart', {primary: true}) + button('Back to Play', 'arcade-hub'))}</div>`;
  const timer = answering ? clock(active.deadlineAt, Date.now()) : null;
  const strip = `<div class="arcade-score-strip"><div class="arcade-stat"><span class="arcade-stat-label">Hearts left</span>${hearts(active.hearts)}</div><div class="arcade-stat"><span class="arcade-stat-label">Round score</span><strong>${points(active.score)}<small> points</small></strong></div>${timer ? timer.html : '<div class="arcade-paused"><span aria-hidden="true">' + icon('book') + '</span><strong>Clock paused</strong><span>Time to understand.</span></div>'}</div>${timer ? timer.bar : ''}`;
  if (answering) return `<div class="arcade arcade-frenzy is-answering">${header}${strip}${questionCard(usableQuestion, voiceHTML, 'data-arcade-answer', visualsHTML)}<p class="arcade-round-note">30 seconds each · 3 hearts · 100 points per correct answer.</p><p class="arcade-small-note">Saved on this phone. The question clock keeps running if you leave.</p></div>`;
  const explanation = feedback(usableQuestion, summary.lastResponse, usableQuestion.answer, lessonHTML, {terminal: complete, visualsHTML});
  if (!complete) return `<div class="arcade arcade-frenzy">${header}${strip}${explanation}<div class="arcade-actions"><p>Clock paused. Read, recall, then continue.</p>${button('Next question →', 'frenzy-next', {primary: true})}</div></div>`;
  const result = `<section class="arcade-results"><span class="arcade-result-icon" aria-hidden="true">${icon('trophy')}</span><p class="eyebrow">${active.reason === 'hearts' ? 'THREE HEARTS USED. IDEAS TO REVISIT.' : 'THE LAST QUESTION. A ROUND WELL SPENT.'}</p><h2>${points(active.score)} <small>points</small></h2><div class="arcade-result-stats"><div><strong>${summary.correct}<small> / ${summary.answered}</small></strong><span>answered correctly</span></div><div><strong>${summary.answered}</strong><span>questions answered</span></div><div>${hearts(active.hearts)}<span>hearts remaining</span></div></div><p>100 points for each correct answer. Every explanation is a chance to strengthen the idea.</p></section>`;
  return `<div class="arcade arcade-frenzy">${header}${result}<div class="arcade-section-heading"><h2>Your last connection</h2><span>The final explanation stays with your round.</span></div>${explanation}<div class="arcade-actions arcade-result-actions">${button('Another Frenzy →', 'frenzy-restart', {primary: true})}${button('Review this round', 'arcade-review')}${button('Back to Play', 'arcade-hub')}</div></div>`;
}

function playerStatus(player) {
  if (player?.phase === 'feedback') return player.complete ? 'Reading the final explanation' : 'Reading an explanation';
  if (player?.complete || player?.phase === 'complete') return 'Round finished';
  return player?.phase === 'question' ? 'Answering' : 'Ready to begin';
}
function challengeStatus(challenge) {
  if (challenge.status === 'expired') return 'Invitation expired';
  if (challenge.result === 'win') return 'You won this round';
  if (challenge.result === 'loss') return 'Your friend won this round';
  if (challenge.result === 'draw') return 'A draw';
  if (!challenge.opponent) return 'Waiting for your friend';
  return challenge.you?.complete ? 'Your round is finished' : 'A round to continue';
}

export function renderDuelHub({signedIn = false, configured = false, loading = false, challenges = [], error = ''} = {}) {
  const available = !!signedIn && !!configured && !loading;
  const message = error && (typeof error === 'string' ? error : error.message);
  const history = signedIn && configured && Array.isArray(challenges) ? challenges.filter(challenge => challenge && typeof challenge.id === 'string') : [];
  return `<div class="arcade arcade-duel-hub" aria-busy="${!!loading}"><header class="arcade-header"><p class="eyebrow">FRIEND DUEL · JUST THE TWO OF YOU</p><div class="arcade-topline"><h1 tabindex="-1">A little friendly competition.</h1>${button('Back to Play', 'arcade-hub')}</div><p class="arcade-subtitle">Choose a shared question set, invite a friend, and compare your scores. Explanations stay part of the game.</p></header>${message ? `<div class="arcade-error" role="alert">${esc(message)}</div>` : ''}${!configured ? '<section class="arcade-panel arcade-access-note"><h2>Friend Duels are getting ready.</h2><p>Duels are not available on this installation yet. You can keep playing Solo Frenzy in the meantime.</p></section>' : !signedIn ? `<section class="arcade-panel arcade-access-note"><h2>Bring a friend along.</h2><p>Sign in to create an invitation or join a private Duel. Scores are visible to you and your invited friend.</p>${button('Sign in to play', 'account', {primary: true})}</section>` : ''}${loading ? '<p class="arcade-loading" role="status">Checking your private Duels…</p>' : ''}<div class="arcade-duel-grid"><section class="arcade-panel"><span class="arcade-panel-icon" aria-hidden="true">${icon('target')}</span><h2>Make an invitation.</h2><p>Pick your subjects and a round of 10 or 20 questions, then share the code with your friend.</p><p class="arcade-small-note">30 seconds each · 3 hearts · 100 points per correct answer.</p>${button('Create a Duel →', 'duel-create', {primary: true, disabled: !available})}</section><section class="arcade-panel"><span class="arcade-panel-icon" aria-hidden="true">${icon('play')}</span><h2>Have a code?</h2><label class="arcade-input-label" for="duel-code">Invitation code</label><div class="arcade-join-form"><input id="duel-code" name="duel-code" type="text" inputmode="text" maxlength="8" minlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD2345" aria-describedby="duel-code-hint"${available ? '' : ' disabled'}>${button('Join Duel', 'duel-join', {disabled: !available})}</div><p class="arcade-small-note" id="duel-code-hint">Enter the eight-character code your friend shared.</p></section></div>${signedIn && configured ? `<div class="arcade-section-heading"><h2>Your private Duels</h2><span>Only you and your friend see the scores.</span></div>${history.length ? `<div class="arcade-challenge-list">${history.map(challenge => `<article class="arcade-challenge"><div><span class="arcade-invite-code">${esc(challenge.code || 'Private Duel')}</span><h3>${challengeStatus(challenge)}</h3><p>${topicLabel(challenge.topics)} · ${number(challenge.questionCount)} questions</p><div class="arcade-challenge-scores"><span>You: <strong>${points(challenge.you?.score)} points</strong></span><span>${challenge.opponent ? `Friend: <strong>${points(challenge.opponent.score)} points</strong>` : 'Your friend has not joined yet.'}</span></div></div><button type="button" class="btn arcade-btn" data-duel-id="${esc(challenge.id)}" aria-label="Open private Duel ${esc(challenge.code || '')}"${loading ? ' disabled' : ''}>${challenge.status === 'complete' || challenge.you?.complete ? 'See your Duel →' : challenge.opponent ? 'Continue →' : 'Open invitation →'}</button></article>`).join('')}</div>` : '<section class="arcade-empty arcade-empty-small"><h3>Your first invitation starts here.</h3><p>Create a Duel or enter your friend’s code. You can return to your round from this list.</p></section>'}` : ''}</div>`;
}

function playerCard(player, label, yours) {
  if (!player) return `<section class="arcade-player is-waiting" aria-label="Your friend has not joined"><span class="arcade-player-label">Your friend</span><span class="arcade-waiting-icon" aria-hidden="true">${icon('play')}</span><strong>Waiting to join</strong><p>Share your invitation code.</p></section>`;
  return `<section class="arcade-player${yours ? ' is-you' : ''}" aria-label="${label} round"><span class="arcade-player-label">${label}</span><strong class="arcade-player-score">${points(player.score)}<small> points</small></strong>${hearts(player.hearts)}<p>${number(player.answered)} answered · ${playerStatus(player)}</p></section>`;
}

export function renderDuel({turn, q, voiceHTML = '', visualsHTML = '', lessonHTML = ''} = {}) {
  if (!turn) return `<div class="arcade">${unavailable('Open your private Duel to continue where you left off.', button('Back to your Duels', 'arcade-hub', {primary: true}))}</div>`;
  const answering = turn.phase === 'question', feedbackPhase = turn.phase === 'feedback';
  const header = `<header class="arcade-header"><p class="eyebrow">FRIEND DUEL · PRIVATE SCORES</p><div class="arcade-topline"><h1 tabindex="-1">${answering ? 'Your move. Your connection.' : feedbackPhase ? 'Take the idea with you.' : 'Your round, in view.'}</h1><div class="arcade-button-row">${button(`${icon('refresh')}<span>Refresh</span>`, 'duel-refresh', {extra: 'aria-label="Refresh this Duel"'})}${button(`${icon('arrow')}<span>Back to Play</span>`, 'arcade-hub', {extra: 'aria-label="Back to Play"'})}</div></div><p class="arcade-subtitle">${topicLabel(turn.topics)} · ${number(turn.questionCount)} questions</p></header><div class="arcade-invite-strip"><div><span>Invitation code</span><strong class="arcade-invite-code">${esc(turn.code)}</strong></div>${button(`${icon('cards')}<span>Copy invitation</span>`, 'duel-copy', {extra: 'aria-label="Copy invitation code"'})}</div><div class="arcade-duel-players">${playerCard(turn.you, 'You', true)}${playerCard(turn.opponent, 'Your friend', false)}</div>`;
  if (turn.status === 'expired') return `<div class="arcade arcade-duel">${header}<section class="arcade-empty"><h2>This invitation has expired.</h2><p>Your private list keeps the round information. Create another invitation when you are ready.</p><div class="arcade-button-row">${button('New Duel', 'duel-create', {primary: true})}${button('Back to Play', 'arcade-hub')}</div></section></div>`;
  if (answering) {
    if (!q || q.id !== turn.qid || !Array.isArray(q.options)) return `<div class="arcade arcade-duel">${header}${unavailable('Refresh this Duel to load the current question from your collection.', button('Refresh question', 'duel-refresh', {primary: true}))}</div>`;
    const timer = clock(turn.deadline, turn.serverNow);
    return `<div class="arcade arcade-duel is-answering">${header}<div class="arcade-duel-question-strip"><span class="badge">QUESTION ${number(turn.position) + 1} OF ${number(turn.questionCount)}</span>${timer.html}</div>${timer.bar}${questionCard(q, voiceHTML, 'data-duel-answer', visualsHTML)}<p class="arcade-round-note">30 seconds each · 3 hearts · 100 points per correct answer.</p><p class="arcade-small-note">Your question clock keeps running if you leave. Read every explanation before you start the next question.</p></div>`;
  }
  if (feedbackPhase) {
    const last = turn.lastAnswer;
    const current = q && q.id === last?.qid ? q : null;
    return `<div class="arcade arcade-duel">${header}<div class="arcade-feedback-heading"><span class="badge">QUESTION ${number(turn.position) + 1} OF ${number(turn.questionCount)}</span><span class="arcade-pause-label">${icon('book')}Clock paused for the explanation</span></div>${feedback(current, last, last?.answerIndex ?? 0, lessonHTML, {terminal: !!turn.you?.complete, visualsHTML})}<div class="arcade-actions"><p>${turn.you?.complete ? 'Your final explanation is here. Continue when you are ready to see the result.' : 'Read, recall, then start the next 30-second question.'}</p>${button(turn.you?.complete ? 'See Duel result →' : 'Next question →', 'duel-next', {primary: true})}</div></div>`;
  }
  const outcome = turn.result === 'win' ? 'You won this Duel.' : turn.result === 'loss' ? 'Your friend won this Duel.' : turn.result === 'draw' ? 'A well-matched draw.' : 'Your round is finished.';
  const pending = turn.result === null || turn.result === undefined;
  return `<div class="arcade arcade-duel">${header}<section class="arcade-results"><span class="arcade-result-icon" aria-hidden="true">${icon('trophy')}</span><h2>${outcome}</h2><strong class="arcade-final-score">${points(turn.you?.score)} <small>your points</small></strong><p>${pending ? 'Your friend can finish in their own time. Refresh to see both final scores.' : '100 points for each correct answer, with every explanation part of the round.'}</p><div class="arcade-button-row">${pending ? button('Refresh scores', 'duel-refresh', {primary: true}) : button('Back to Play', 'arcade-hub', {primary: true})}${button('New invitation', 'duel-create')}</div></section><p class="arcade-small-note">These scores stay between you and your invited friend.</p></div>`;
}
