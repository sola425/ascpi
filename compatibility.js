/* Small ES5 bootstrap for WebViews that support app syntax but lack ES2022 helpers. */
(function () {
  'use strict';
  var define = function (target, name, implementation) {
    if (typeof target[name] !== 'function') {
      Object.defineProperty(target, name, {value: implementation, configurable: true, writable: true});
    }
  };
  define(Object, 'hasOwn', function (value, name) {
    if (value === null || value === undefined) throw new TypeError('Cannot inspect null or undefined.');
    return Object.prototype.hasOwnProperty.call(Object(value), name);
  });
  define(Array.prototype, 'at', function (index) {
    if (this === null || this === undefined) throw new TypeError('Cannot index null or undefined.');
    if (typeof index === 'bigint') throw new TypeError('An index must be a number.');
    var value = Object(this), size = Number(value.length);
    size = size !== size || size <= 0 ? 0 : Math.min(Math.floor(size), 9007199254740991);
    var position = Number(index);
    position = position !== position ? 0 : position < 0 ? Math.ceil(position) : Math.floor(position);
    if (position < 0) position += size;
    return position < 0 || position >= size ? undefined : value[position];
  });
}());

/* A module parse/load failure must not leave the initial loading screen inert. */
(function () {
  'use strict';
  var root = typeof window === 'undefined' ? null : window;
  var doc = typeof document === 'undefined' ? null : document;
  if (!root || !doc || typeof root.addEventListener !== 'function' || typeof doc.getElementById !== 'function' || typeof doc.getElementsByTagName !== 'function' || typeof doc.createElement !== 'function') return;

  function openingContent() {
    if (root.labwiseAppReady === true) return null;
    var content = doc.getElementById('content');
    if (!content || typeof content.getElementsByTagName !== 'function') return null;
    var headings = content.getElementsByTagName('h1');
    return headings.length && String(headings[0].textContent || '').replace(/^\s+|\s+$/g, '').indexOf('Opening your study space') === 0 ? content : null;
  }
  function help() {
    var content = openingContent();
    if (!content) return;
    var section = doc.createElement('section'), heading = doc.createElement('h1'), description = doc.createElement('p'), reload = doc.createElement('button');
    section.className = 'intro'; section.id = 'labwise-startup-help'; section.setAttribute('role', 'alert');
    heading.textContent = 'Labwise could not start.';
    heading.setAttribute('tabindex', '-1');
    description.textContent = 'Update Android System WebView or Chrome, then reload Labwise. This step keeps your saved progress.';
    reload.type = 'button'; reload.className = 'btn primary'; reload.id = 'labwise-startup-reload'; reload.textContent = 'Reload Labwise';
    reload.addEventListener('click', function () { try { root.location.reload(); } catch (ignored) { /* No private error details are displayed. */ } });
    section.appendChild(heading); section.appendChild(description); section.appendChild(reload);
    while (content.firstChild) content.removeChild(content.firstChild);
    content.appendChild(section);
    if (typeof heading.focus === 'function') heading.focus();
  }
  function appModule() {
    var scripts = doc.getElementsByTagName('script'), index;
    for (index = 0; index < scripts.length; index += 1) {
      if (String(scripts[index].getAttribute('type') || '').toLowerCase() === 'module' && /(?:^|\/)app\.js(?:[?#]|$)/.test(scripts[index].getAttribute('src') || '')) return scripts[index];
    }
    return null;
  }
  function belongsToApp(filename, entry) {
    if (typeof filename !== 'string' || !filename) return false;
    var expected = doc.createElement('a'), failed = doc.createElement('a');
    expected.href = entry.src || entry.getAttribute('src'); failed.href = filename;
    var directory = expected.pathname.slice(0, expected.pathname.lastIndexOf('/') + 1);
    return expected.protocol === failed.protocol && expected.host === failed.host && failed.pathname.indexOf(directory) === 0 && /\.js$/.test(failed.pathname);
  }
  root.addEventListener('error', function (event) {
    if (!openingContent()) return;
    var entry = appModule();
    if (!entry) return;
    if (event.target === entry || (event.error && event.error.name === 'SyntaxError' && belongsToApp(event.filename, entry))) help();
  }, true);

  // Browsers without module support ignore the module script without an error.
  if (!('noModule' in doc.createElement('script'))) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', help);
    else help();
  }
}());
