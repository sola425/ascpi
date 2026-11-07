// Voice input produces an editable transcript. Confirmation and scoring belong to the UI.
const SESSION_TIMEOUT = 45000, STOP_TIMEOUT = 5000, MAX_TEXT = 12000;
const TOKEN = /^lwvoice_[a-z0-9]+_[a-z0-9]+_[a-z0-9]+$/;
const nativeRouters = new WeakMap();
let sequence = 0;

function environment() { return typeof window === 'object' ? window : globalThis; }
function nativeBridge(root) {
  try {
    const bridge = root.LabwiseAndroid;
    return bridge && typeof bridge.startVoiceInput === 'function' && typeof bridge.cancelVoiceInput === 'function' ? bridge : null;
  } catch { return null; }
}
function browserRecognizer(root) {
  try { return root.SpeechRecognition || root.webkitSpeechRecognition || null; }
  catch { return null; }
}
export function voiceAvailability() {
  const root = environment();
  if (nativeBridge(root)) return {available: true, kind: 'native'};
  if (typeof browserRecognizer(root) === 'function') return {available: true, kind: 'browser'};
  return {available: false, kind: 'unavailable'};
}

function compact(text) {
  const value = text.normalize('NFC').trim().replace(/\s+/gu, ' ');
  // Sentence punctuation is optional for prose; numeric expressions keep it verbatim.
  return /\d/u.test(value) ? value : value.replace(/[!?]+$/u, '').replace(/([^\d.])\.$/u, '$1').trim();
}
function comparable(text) {
  const value = compact(text);
  // Numeric scientific text retains every sign, decimal and unit, including unit case.
  return /\d/u.test(value) ? value : value.toLowerCase();
}
const letterNames = [
  ['a', 'ay', 'aye', 'alpha'], ['b', 'bee', 'bravo'], ['c', 'see', 'charlie'], ['d', 'dee', 'delta'],
  ['e', 'ee', 'echo'], ['f', 'eff', 'foxtrot'], ['g', 'gee', 'golf'], ['h', 'aitch', 'hotel'],
  ['i', 'eye', 'india'], ['j', 'jay', 'juliet', 'juliett'], ['k', 'kay', 'kilo'], ['l', 'el', 'ell', 'lima'],
  ['m', 'em', 'mike'], ['n', 'en', 'november'], ['o', 'oh', 'oscar'], ['p', 'pee', 'papa'],
  ['q', 'cue', 'queue', 'quebec'], ['r', 'ar', 'are', 'romeo'], ['s', 'ess', 'sierra'], ['t', 'tee', 'tango'],
  ['u', 'you', 'uniform'], ['v', 'vee', 'victor'], ['w', 'double u', 'double you', 'whiskey'],
  ['x', 'ex', 'x-ray', 'x ray'], ['y', 'why', 'yankee'], ['z', 'zee', 'zed', 'zulu']
];
const ordinals = [
  ['one', 'first', '1'], ['two', 'second', '2'], ['three', 'third', '3'], ['four', 'fourth', '4'],
  ['five', 'fifth', '5'], ['six', 'sixth', '6'], ['seven', 'seventh', '7'], ['eight', 'eighth', '8'],
  ['nine', 'ninth', '9'], ['ten', 'tenth', '10']
];

export function matchSpokenChoice(transcript, options) {
  if (!Array.isArray(options) || !options.length || options.some(option => typeof option !== 'string' || !option.trim())) return {index: null, reason: 'invalid-options'};
  if (typeof transcript !== 'string' || !transcript.trim()) return {index: null, reason: 'empty'};
  const raw = compact(transcript);
  const candidates = [raw];
  const prefixed = raw.match(/^(?:(?:my|the) answer is|answer is|(?:my|the) choice is|i (?:choose|select|pick))\s*:?\s+(.+)$/iu);
  if (prefixed) candidates.push(prefixed[1]);
  const matches = new Map();
  for (const candidate of candidates) {
    const exact = comparable(candidate);
    options.forEach((option, index) => {
      if (comparable(option) === exact) matches.set(index, matches.get(index) || 'exact-text');
    });
    const spoken = compact(candidate).toLowerCase();
    const labelled = spoken.match(/^(?:option|choice|answer)\s+(?:number\s+)?(.+)$/u);
    const label = labelled ? labelled[1].replace(/[.!?]+$/u, '') : spoken;
    const letter = letterNames.findIndex(names => names.includes(label));
    if (letter >= 0 && letter < options.length) matches.set(letter, 'explicit-choice');
    // Bare numbers and number words are option text, never implicit ordinals.
    const ordinal = labelled ? ordinals.findIndex(names => names.includes(label)) : -1;
    if (ordinal >= 0 && ordinal < options.length) matches.set(ordinal, 'explicit-choice');
  }
  if (matches.size > 1) return {index: null, reason: 'ambiguous'};
  if (matches.size === 1) {
    const [index, reason] = matches.entries().next().value;
    return {index, reason};
  }
  return {index: null, reason: 'no-match'};
}

function routerFor(root) {
  let router = nativeRouters.get(root);
  if (!router) {
    const sessions = new Map();
    const receive = (token, payload) => {
      if (typeof token !== 'string' || token.length > 96 || !TOKEN.test(token)) return;
      const callback = sessions.get(token);
      if (callback) callback(payload);
    };
    router = {sessions, receive};
    nativeRouters.set(root, router);
  }
  root.labwiseNativeVoiceResult = router.receive;
  return router;
}
function languageTag(language) {
  return typeof language === 'string' && language.length <= 63 && /^[a-z]{2,8}(?:-[a-z0-9]{1,8}){0,6}$/iu.test(language) ? language : 'en-US';
}
function transcriptData(text, alternatives = []) {
  const values = [text, ...(Array.isArray(alternatives) ? alternatives : [])]
    .filter(value => typeof value === 'string').map(value => value.trim().slice(0, MAX_TEXT)).filter(Boolean);
  const unique = [...new Set(values)].slice(0, 5);
  return {text: unique[0] || '', alternatives: unique};
}
const errors = {
  unavailable: 'Voice input is not available here. You can type your answer.',
  timeout: 'Voice input timed out. Try again or type your answer.',
  'no-speech': 'No speech was recognized. Try again or type your answer.',
  'not-allowed': 'Microphone access was not allowed. Check your speech provider permissions or type your answer.',
  'service-not-allowed': 'The speech provider is not allowed to use the microphone. You can type your answer.',
  network: 'The speech provider could not connect. Try again or type your answer.',
  'audio-capture': 'No microphone is available to the speech provider. You can type your answer.',
  'language-not-supported': 'The speech provider does not support this language. You can type your answer.',
  error: 'Voice input could not finish. Try again or type your answer.'
};

export function createVoiceController({onState = () => {}, onResult = () => {}, onError = () => {}} = {}) {
  let active = null, revision = 0;

  function reportState(session, status) { onState({status, context: session.context}); }
  function schedule(session, duration) {
    if (session.timer !== null) session.clearTimer(session.timer);
    session.timer = session.setTimer(() => {
      if (active === session) fail(session, 'timeout', undefined, true);
    }, duration);
  }
  function release(session, abort = false) {
    if (active !== session) return false;
    active = null; // Invalidate before provider calls, which may synchronously emit events.
    if (session.timer !== null) session.clearTimer(session.timer);
    session.router?.sessions.delete(session.token);
    session.removeNavigation?.();
    if (session.recognition) {
      for (const name of ['onresult', 'onerror', 'onend', 'onspeechend']) session.recognition[name] = null;
      if (abort) try { session.recognition.abort(); } catch { /* Already stopped. */ }
    }
    if (abort && session.bridge) try { session.bridge.cancelVoiceInput(session.token); } catch { /* Token is already invalid. */ }
    reportState(session, 'idle');
    return true;
  }
  function fail(session, code = 'error', message, abort = false) {
    if (!release(session, abort)) return;
    if (session.revision !== revision) return;
    onError({message: typeof message === 'string' && message.trim() ? message.slice(0, 500) : errors[code] || errors.error, context: session.context, code});
  }
  function deliver(session, data) {
    if (!data.text) return fail(session, 'no-speech', undefined, true);
    if (!release(session, !session.bridge) || session.revision !== revision) return;
    onResult({...data, context: session.context});
  }
  function cancel() { revision++; if (active) release(active, true); }
  function start(context, language = 'en-US') {
    cancel();
    const root = environment(), bridge = nativeBridge(root), Recognizer = browserRecognizer(root);
    if (!bridge && typeof Recognizer !== 'function') {
      onError({message: errors.unavailable, context, code: 'unavailable'});
      return false;
    }
    const nonce = Math.random().toString(36).slice(2, 12) || '0';
    const session = {
      root, bridge, context, revision, token: `lwvoice_${nonce}_${Date.now().toString(36)}_${(++sequence).toString(36)}`,
      recognition: null, timer: null, router: null, stopping: false,
      setTimer: (root.setTimeout || globalThis.setTimeout).bind(root),
      clearTimer: (root.clearTimeout || globalThis.clearTimeout).bind(root)
    };
    active = session;
    if (typeof root.addEventListener === 'function') {
      const events = ['pagehide', 'beforeunload', 'popstate', 'hashchange'];
      const navigate = () => { if (active === session) cancel(); };
      for (const event of events) root.addEventListener(event, navigate);
      session.removeNavigation = () => { for (const event of events) root.removeEventListener(event, navigate); };
    }
    schedule(session, SESSION_TIMEOUT);
    reportState(session, 'listening');
    if (active !== session) return false;
    if (bridge) {
      session.router = routerFor(root);
      session.router.sessions.set(session.token, payload => {
        if (active !== session) return;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail(session, 'error');
        if (payload.status === 'ok') return deliver(session, transcriptData(payload.text, payload.alternatives));
        if (payload.status === 'cancelled') return release(session);
        const code = payload.status === 'unavailable' ? 'unavailable' : (typeof payload.code === 'string' && Object.hasOwn(errors, payload.code) ? payload.code : 'error');
        fail(session, code, payload.message);
      });
      try { bridge.startVoiceInput(session.token, languageTag(language)); }
      catch { fail(session, 'error', undefined, true); return false; }
      return true;
    }
    try {
      const recognition = new Recognizer();
      session.recognition = recognition;
      recognition.lang = languageTag(language);
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 5;
      recognition.onresult = event => {
        if (active !== session) return;
        const finalResults = Array.from(event.results || []).filter(result => result?.isFinal === true);
        if (!finalResults.length) return;
        const choices = Array.from({length: 5}, (_, index) => finalResults.map(result => result[index]?.transcript || (index ? result[0]?.transcript : '') || '').join(' ').trim());
        deliver(session, transcriptData(choices[0], choices));
      };
      recognition.onerror = event => {
        if (active !== session) return;
        if (event.error === 'aborted') release(session, true);
        else fail(session, typeof event.error === 'string' && Object.hasOwn(errors, event.error) ? event.error : 'error', undefined, true);
      };
      recognition.onend = () => { if (active === session) fail(session, 'no-speech'); };
      recognition.onspeechend = () => { if (active === session && !session.stopping) reportState(session, 'processing'); };
      recognition.start();
      return true;
    } catch { fail(session, 'error', undefined, true); return false; }
  }
  function stop() {
    const session = active;
    if (!session || session.stopping) return;
    // The external Android activity owns its finish control; our bridge can only cancel it.
    if (session.bridge) return cancel();
    session.stopping = true;
    reportState(session, 'processing');
    if (active !== session) return;
    schedule(session, STOP_TIMEOUT);
    try { session.recognition.stop(); }
    catch { fail(session, 'error', undefined, true); }
  }
  return {start, cancel, stop, supported: () => voiceAvailability().available};
}
