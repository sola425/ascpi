import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {icon} from '../icons.js';
import {TOUR_STEPS, needsOnboarding, onboardingStep} from '../onboarding.js';
import {renderAccount} from '../account-ui.js';

const textContent = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const actions = html => [...html.matchAll(/data-action="([^"]+)"/g)].map(match => match[1]);

test('six stable steps follow the intended first-use learning path', () => {
  assert.deepEqual(TOUR_STEPS.map(step => step.id), ['welcome', 'explanations', 'play', 'voice', 'friends', 'progress']);
  assert.equal(Object.isFrozen(TOUR_STEPS), true);
  for (const step of TOUR_STEPS) assert.equal(Object.isFrozen(step), true);
});

test('bounded navigation keeps invalid, fractional and out-of-range indices in the tour', () => {
  const first = onboardingStep(0), last = onboardingStep(5);
  for (const index of [undefined, null, NaN, Infinity, -Infinity, '2', {}, -10, -0.5]) assert.deepEqual(onboardingStep(index), first, String(index));
  assert.deepEqual(onboardingStep(1.9), onboardingStep(1));
  for (const index of [6, 99, Number.MAX_SAFE_INTEGER]) assert.deepEqual(onboardingStep(index), last);
  assert.match(first.footer, /data-action="tour-back"[^>]*disabled/);
  assert.deepEqual(actions(first.footer), ['tour-back', 'tour-skip', 'tour-next']);
  assert.deepEqual(actions(last.footer), ['tour-back', 'tour-skip', 'tour-finish']);
  assert.doesNotMatch(last.footer, /tour-next/);
  assert.match(textContent(last.footer), /Explore/);
});

test('every step exposes visible progress, a focus target and explicitly labelled controls', () => {
  for (let index = 0; index < TOUR_STEPS.length; index++) {
    const step = onboardingStep(index);
    assert.deepEqual(Object.keys(step), ['title', 'body', 'footer']);
    assert.equal(step.title, TOUR_STEPS[index].title);
    assert.match(textContent(step.body), new RegExp(`Step ${index + 1} of 6`));
    assert.match(step.body, /tabindex="-1"/);
    assert.match(step.body, /aria-label="Getting started, step \d of 6"/);
    assert.match(step.body, /aria-describedby="tour-description"/);
    assert.match(step.body, /id="tour-description"/);
    assert.match(step.body, /role="status" aria-live="polite" aria-atomic="true"/);
    const buttons = [...step.footer.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
    assert.equal(buttons.length, 3);
    for (const [, attributes, label] of buttons) {
      assert.match(attributes, /type="button"/);
      assert.match(attributes, /aria-label="[^"]+"/);
      assert.ok(textContent(label));
    }
    for (const action of actions(step.body + step.footer)) assert.ok(['tour-next', 'tour-back', 'tour-skip', 'tour-finish'].includes(action));
    for (const svg of step.body.matchAll(/<svg\b([^>]*)>/g)) assert.match(svg[1], /aria-hidden="true"/);
  }
});

test('tour covers explanations, all choices, recall, optional timed play, voice review and backups', () => {
  const explanations = textContent(onboardingStep(1).body);
  assert.match(explanations, /plain language/);
  assert.match(explanations, /every choice.*each option/);
  assert.match(explanations, /before revealing the answer/);
  const play = textContent(onboardingStep(2).body);
  assert.match(play, /choose a subject/);
  assert.match(play, /Lab Sprint · five questions/);
  assert.match(play, /Frenzy · 30 seconds each · 3 hearts/);
  assert.match(play, /A wrong answer or timeout costs one heart/);
  assert.match(play, /Timed play is optional/);
  const voice = textContent(onboardingStep(3).body);
  assert.match(voice, /Voice is optional/);
  assert.match(voice, /Check or edit the transcript/);
  assert.match(voice, /Confirm your answer/);
  assert.match(voice, /Tapping an answer always works/);
  const finish = textContent(onboardingStep(5).body);
  assert.match(finish, /progress backup before changing phones, clearing app data or uninstalling/);
  assert.match(finish, /Play.*Practice.*Flashcards.*Library/);
  assert.match(finish, /without starting a round/);
});

test('unconfigured sync never implies an account or live syncing is available', () => {
  const offline = textContent(onboardingStep(4).body);
  assert.match(offline, /Friend challenge/);
  assert.match(offline, /without an account/);
  assert.match(offline, /Account sync isn’t configured in this build/);
  assert.match(offline, /Export a progress backup/);
  assert.doesNotMatch(offline, /sign in and sync|signed in|synced automatically/);
  assert.deepEqual(onboardingStep(4, {syncAvailable: 'true'}), onboardingStep(4));
  const configured = textContent(onboardingStep(4, {syncAvailable: true}).body);
  assert.match(configured, /Account sync is optional/);
  assert.match(configured, /if you want to sign in and sync progress/);
  assert.match(configured, /without an account/);
  assert.doesNotMatch(configured, /isn’t configured/);
});

test('first-use eligibility respects saved dismissal, completion and existing learners', () => {
  assert.equal(needsOnboarding(), true);
  assert.equal(needsOnboarding(undefined, false), true);
  assert.equal(needsOnboarding(null, false), true);
  assert.equal(needsOnboarding({}, false), true);
  assert.equal(needsOnboarding({completed: false, dismissed: false}, false), true);
  for (const flags of [{completed: true}, {dismissed: true}, {completed: true, dismissed: true}]) assert.equal(needsOnboarding(flags, false), false);
  assert.equal(needsOnboarding({}, true), false);
  assert.equal(needsOnboarding(undefined, true), false);
  const flags = {dismissed: true};
  assert.equal(needsOnboarding(flags, false), false);
  assert.ok(onboardingStep(0).body, 'settings can render the tour regardless of the first-use flags');
  assert.deepEqual(flags, {dismissed: true}, 'rendering or checking eligibility never clears a saved dismissal');
});

test('rendering is deterministic and has no device, storage, microphone or account side effects', () => {
  const source = readFileSync(new URL('../onboarding.js', import.meta.url), 'utf8');
  // Test the renderer in its own realm so hostile globals cannot affect the test runner.
  const context = {icon};
  for (const key of ['window', 'document', 'localStorage', 'navigator', 'setTimeout', 'setInterval', 'fetch']) {
    Object.defineProperty(context, key, {get() { throw Error(`Unexpected ambient access: ${key}`); }});
  }
  const script = source.replace(/^import \{icon\} from '\.\/icons\.js';\s*/m, '').replace(/\bexport /g, '') + '\n({onboardingStep, needsOnboarding})';
  const fresh = runInNewContext(script, context, {timeout: 1000});
  for (let index = 0; index < 6; index++) assert.deepEqual(JSON.parse(JSON.stringify(fresh.onboardingStep(index))), onboardingStep(index));
  assert.equal(fresh.needsOnboarding(), true);
  assert.doesNotMatch(source, /\b(?:setTimeout|setInterval|requestAnimationFrame|SpeechRecognition|speechSynthesis|getUserMedia|fetch)\s*\(/);
  const html = Array.from({length: 6}, (_, index) => onboardingStep(index)).map(step => step.body + step.footer).join('');
  assert.doesNotMatch(html, /<(?:audio|video|iframe|script)\b|\bautoplay\b|\son\w+\s*=/i);
});

test('tour motion is short, scoped and disabled for reduced-motion users', () => {
  const css = readFileSync(new URL('../onboarding.css', import.meta.url), 'utf8');
  assert.match(css, /animation:\s*onboarding-arrive 140ms/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.onboarding\s*\{\s*animation:\s*none/);
  assert.match(css, /max-height:\s*85dvh/);
  assert.match(css, /min-height:\s*44px/);
  assert.doesNotMatch(css, /\binfinite\b/);
});

test('pilot accounts offer sign-in while unavailable email flows remain hidden', () => {
  const status = {configured: true, phase: 'signedOut', user: null, pending: false};
  for (const mode of ['signIn', 'signUp', 'reset']) {
    const html = renderAccount({status, mode, emailFlowsAvailable: false});
    assert.match(html, /id="account-form" method="post"/);
    assert.match(html, /Sign in to your account/);
    assert.match(html, /autocomplete="current-password"/);
    assert.match(html, /For this pilot, sign in with a confirmed account/);
    assert.match(html, /Public account creation and password reset will be available after email setup/);
    assert.doesNotMatch(html, /data-action="account-(?:signup|reset)"|autocomplete="new-password"|Request reset instructions|minlength=/);
  }
  const pending = renderAccount({status: {...status, phase: 'needsConfirmation'}, emailFlowsAvailable: false});
  assert.doesNotMatch(pending, /follow any confirmation instructions|Delivery may take time/);
  const ordinary = renderAccount({status});
  assert.match(ordinary, /data-action="account-signup"/);
  assert.match(ordinary, /data-action="account-reset"/);
  assert.match(renderAccount({status, mode: 'signUp'}), /autocomplete="new-password" minlength="12" maxlength="128"/);
  const reset = renderAccount({status, mode: 'reset'});
  assert.match(reset, /If an account uses that email/);
  assert.doesNotMatch(reset, /id="account-password"/);
});

test('account rendering is pure and escapes owner messages without exposing credentials or configuration', () => {
  const source = readFileSync(new URL('../account-ui.js', import.meta.url), 'utf8');
  const context = {icon};
  for (const key of ['window', 'document', 'localStorage', 'navigator', 'fetch', 'setTimeout']) {
    Object.defineProperty(context, key, {get() { throw Error(`Unexpected account ambient access: ${key}`); }});
  }
  const script = source.replace(/^import \{icon\} from '\.\/icons\.js';\s*/m, '').replace(/\bexport /g, '') + '\nrenderAccount';
  const fresh = runInNewContext(script, context, {timeout: 1000});
  const props = {emailFlowsAvailable: false, status: {configured: true, phase: 'offline', pending: true,
    user: {id: 'private-owner-id', email: 'owner+<tag>@example.test'}, error: '<script>error</script>', password: 'never-render-this-password', url: 'https://do-not-render.invalid'}};
  const html = fresh(props);
  assert.equal(html, renderAccount(props));
  assert.match(html, /owner\+&lt;tag&gt;@example.test/);
  assert.match(html, /&lt;script&gt;error&lt;\/script&gt;/);
  assert.match(html, /data-action="account-sync"/);
  assert.match(html, /data-action="account-signout"/);
  assert.match(html, /data-action="duel-hub"/);
  assert.doesNotMatch(html, /<script>|private-owner-id|never-render-this-password|do-not-render.invalid/);
  const form = fresh({emailFlowsAvailable: false, status: {configured: true, phase: 'signedOut'}});
  assert.doesNotMatch(form, /<input\b[^>]*type="password"[^>]*value=/);
});
