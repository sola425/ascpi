import {icon} from './icons.js';

export const TOUR_STEPS = Object.freeze([
  {id: 'welcome', title: 'A little learning, at your pace.', icon: 'flask'},
  {id: 'explanations', title: 'Understand every choice.', icon: 'book'},
  {id: 'play', title: 'Choose a subject. Find your pace.', icon: 'play'},
  {id: 'voice', title: 'Speak, check, then confirm.', icon: 'mic'},
  {id: 'friends', title: 'A round to share.', icon: 'target'},
  {id: 'progress', title: 'Keep your progress. Choose a start.', icon: 'progress'}
].map(step => Object.freeze(step)));

/** First-use flags are device-local; opening this tour from settings is unconditional. */
export function needsOnboarding(flags = {}, hasExistingProgress = false) {
  return !hasExistingProgress && flags?.completed !== true && flags?.dismissed !== true;
}

const item = (title, text) => `<li><strong>${title}</strong><span>${text}</span></li>`;
const list = items => `<ul class="onboarding-list">${items.join('')}</ul>`;
const note = text => `<p class="onboarding-note">${text}</p>`;

function content(id, syncAvailable) {
  switch (id) {
    case 'welcome':
      return `<p class="onboarding-summary" id="tour-description">Short questions, useful explanations, and another chance to remember.</p>
        <div class="onboarding-path" aria-label="Your learning loop">
          <span>${icon('check')}<strong>Answer</strong></span><span>${icon('book')}<strong>Understand</strong></span><span>${icon('refresh')}<strong>Recall</strong></span>
        </div>
        ${note('Take this tour one step at a time. It moves only when you choose Next. No account needed.')}
        <p class="onboarding-hint">Skip whenever you like. Your choice is remembered on this device; open Getting started in Study settings to return.</p>`;
    case 'explanations':
      return `<p class="onboarding-summary" id="tour-description">Each answer is a starting point for understanding.</p>
        ${list([
          item('Read the explanation', 'See the idea in plain language after answering.'),
          item('Explore every choice', 'Learn why each option fits or misses the question.'),
          item('Try the memory check', 'Recall the idea before revealing the answer, then continue when you’re ready.')
        ])}`;
    case 'play':
      return `<p class="onboarding-summary" id="tour-description">Open Play and choose a subject, or mix subjects.</p>
        ${list([
          item('Lab Sprint · five questions', 'Take a short round with explanations and memory checks. Read at your own pace.'),
          item('Frenzy · 30 seconds each · 3 hearts', 'Try a faster round when you feel ready. A wrong answer or timeout costs one heart.'),
          item('Practice · your own pace', 'Explore questions without a countdown, and revisit explanations whenever you need.')
        ])}
        ${note('Timed play is optional. Choose the mode that feels comfortable today.')}`;
    case 'voice':
      return `<p class="onboarding-summary" id="tour-description">Voice is optional. Tapping an answer always works.</p>
        ${list([
          item('Choose when to speak', 'Tap the microphone only when you want to use it.'),
          item('Check or edit the transcript', 'Make sure the words and selected answer match what you meant.'),
          item('Confirm your answer', 'You submit the answer after checking it.')
        ])}
        ${note('Voice availability depends on your device or browser and may need a connection. This tour never opens the microphone.')}`;
    case 'friends':
      return `<p class="onboarding-summary" id="tour-description">Use Friend challenge in Play to share a round and compare results.</p>
        ${list([
          item('Invite a friend', 'Share a challenge and each play when you’re ready.'),
          item('Study without an account', 'Your questions, explanations and local progress stay available without signing in.'),
          item('Account sync is optional', syncAvailable === true
            ? 'Choose account sync in Study settings if you want to sign in and sync progress across devices.'
            : 'Account sync isn’t configured in this build. Export a progress backup when moving to another device.')
        ])}
        ${note('This tour never signs you in or sends a challenge.')}`;
    case 'progress':
      return `<p class="onboarding-summary" id="tour-description">Small steps add up. Choose what you’d like to explore after the tour.</p>
        ${list([
          item('Progress', 'See practice accuracy and ideas due for review. Game XP celebrates practice; it does not measure exam readiness.'),
          item('Export a backup', 'Keep a progress backup before changing phones, clearing app data or uninstalling.'),
          item('Choose your first stop', 'Play for a short round, Practice for questions, Flashcards for recall, or Library for source reading.')
        ])}
        ${note('Explore opens the app without starting a round. You can revisit this tour from Study settings → Getting started.')}`;
    default:
      return '';
  }
}

/** Pure HTML renderer. The host owns navigation, focus, dismissal and persistence. */
export function onboardingStep(index, {syncAvailable = false} = {}) {
  const current = Number.isFinite(index) ? Math.max(0, Math.min(TOUR_STEPS.length - 1, Math.trunc(index))) : 0;
  const step = TOUR_STEPS[current];
  const last = current === TOUR_STEPS.length - 1;
  const progress = `Step ${current + 1} of ${TOUR_STEPS.length}`;
  return {
    title: step.title,
    body: `<section class="onboarding" data-tour-step="${current + 1}" tabindex="-1" aria-label="Getting started, ${progress.toLowerCase()}" aria-describedby="tour-description">
      <div class="onboarding-top"><span class="onboarding-icon">${icon(step.icon)}</span><div><p class="onboarding-kicker">GETTING STARTED</p><p class="onboarding-count" role="status" aria-live="polite" aria-atomic="true">${progress}</p></div></div>
      <div class="onboarding-track" aria-hidden="true">${TOUR_STEPS.map((_, i) => `<span${i <= current ? ' class="is-reached"' : ''}></span>`).join('')}</div>
      ${content(step.id, syncAvailable)}
    </section>`,
    footer: `<div class="onboarding-controls" aria-label="Tour controls">
      <button class="btn onboarding-back" type="button" data-action="tour-back" aria-label="Back to previous step" ${current === 0 ? 'disabled' : ''}>Back</button>
      <button class="btn onboarding-skip" type="button" data-action="tour-skip" aria-label="Skip tour">Skip</button>
      <button class="btn primary onboarding-primary" type="button" data-action="${last ? 'tour-finish' : 'tour-next'}" aria-label="${last ? 'Finish tour and explore Labwise' : 'Next step'}">${last ? 'Explore' : 'Next'}${icon('arrow')}</button>
    </div>`
  };
}
