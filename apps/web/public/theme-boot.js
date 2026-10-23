/* Applies the cached theme and visual preset before the first paint (no flash of a wrong theme on load).
   Loaded synchronously from <head>; a classic script so that CSP script-src 'self' allows it. The cache is written by
   src/theme/appearance.ts; without it (first visit) the default preset «Как Notion» is used. */
(function () {
  var d = document.documentElement;
  // background of the default preset for the very first visit (kept equal to src/theme/presets.ts by a unit test)
  var FALLBACK =
    ':root[data-preset="notion"]{--bg:#ffffff;--surface:#ffffff;--text:#37352f}' +
    '@media (prefers-color-scheme: dark){:root[data-preset="notion"]:not([data-theme="light"]){color-scheme:dark;--bg:#191919;--surface:#202020;--text:#e8e8e6}}' +
    ':root[data-preset="notion"][data-theme="dark"]{color-scheme:dark;--bg:#191919;--surface:#202020;--text:#e8e8e6}';
  var read = function (k) {
    try {
      return JSON.parse(localStorage.getItem(k) || 'null');
    } catch (e) {
      return null;
    }
  };
  var theme = read('kb:theme');
  if (theme === 'light' || theme === 'dark') d.setAttribute('data-theme', theme);
  var a = read('kb:appearance') || {};
  var preset = typeof a.preset === 'string' && /^[a-z]+$/.test(a.preset) ? a.preset : 'notion';
  d.setAttribute('data-preset', preset);
  if (typeof a.font === 'string' && a.font !== 'preset' && /^[a-z]+$/.test(a.font)) d.setAttribute('data-font', a.font);
  if (typeof a.fontSize === 'string' && a.fontSize !== 'default' && /^[a-z]+$/.test(a.fontSize)) d.setAttribute('data-size', a.fontSize);
  var css = typeof a.css === 'string' && a.preset === preset ? a.css : preset === 'notion' ? FALLBACK : '';
  if (css) {
    var s = document.createElement('style');
    s.id = 'kb-preset-boot';
    s.textContent = css;
    document.head.appendChild(s);
  }
})();
