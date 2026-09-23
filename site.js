/*
 * Braining site — all of its behaviour. L6.
 *
 * Three things and no more: a language toggle that swaps direction as well as strings, a theme
 * toggle, and one typed demo. No framework, no analytics, no network requests of any kind — a
 * site for an app that promises "nothing leaves your phone" has no business phoning anywhere
 * either, and this file is short enough that a visitor can read it and check.
 */
(function () {
  'use strict';

  var html = document.documentElement;

  // ── language ────────────────────────────────────────────────────────────────────────
  //
  // Every translatable node carries both texts in `data-ar` / `data-en`, so the page holds one
  // copy of its content in the markup and switching is a re-read rather than a fetch. The `dir`
  // attribute moves with it: swapping strings without swapping direction is the classic way an
  // RTL site ends up looking translated rather than written.
  function setLang(lang) {
    var ar = lang === 'ar';
    html.lang = ar ? 'ar' : 'en';
    html.dir = ar ? 'rtl' : 'ltr';
    var nodes = document.querySelectorAll('[data-ar]');
    for (var i = 0; i < nodes.length; i++) {
      var t = nodes[i].getAttribute(ar ? 'data-ar' : 'data-en');
      if (t !== null) nodes[i].innerHTML = t;
    }
    var btn = document.getElementById('lang');
    if (btn) btn.textContent = ar ? 'English' : 'العربية';
    try { localStorage.setItem('lang', lang); } catch (e) { /* private mode: the default is fine */ }
  }

  var langBtn = document.getElementById('lang');
  if (langBtn) {
    langBtn.addEventListener('click', function () {
      setLang(html.lang === 'ar' ? 'en' : 'ar');
    });
  }

  // A visitor whose browser is not set to Arabic gets English on first load; a returning one gets
  // whatever they chose. Wrapped, because storage throws outright in some privacy modes.
  try {
    var saved = localStorage.getItem('lang');
    if (saved) setLang(saved);
    else if ((navigator.language || '').slice(0, 2) !== 'ar') setLang('en');
  } catch (e) { /* keep the markup's Arabic */ }

  // ── theme ───────────────────────────────────────────────────────────────────────────
  //
  // Three states, like the app: explicit light, explicit dark, and — the default — no attribute
  // at all, which lets `prefers-color-scheme` decide. The toggle only ever moves between the two
  // explicit states once the visitor has expressed a preference.
  var themeBtn = document.getElementById('theme');
  try {
    var savedTheme = localStorage.getItem('theme');
    if (savedTheme) html.setAttribute('data-theme', savedTheme);
  } catch (e) { /* system preference */ }

  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var current = html.getAttribute('data-theme');
      if (!current) {
        var systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        current = systemDark ? 'dark' : 'light';
      }
      var next = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }

  // ── scroll reveal ───────────────────────────────────────────────────────────────────
  //
  // One effect, once per element. `IntersectionObserver` rather than a scroll listener so it
  // costs nothing while idle; where it is missing, everything is simply visible.
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -60px 0px' });
    for (var j = 0; j < reveals.length; j++) io.observe(reveals[j]);
  } else {
    for (var k = 0; k < reveals.length; k++) reveals[k].classList.add('in');
  }

  // ── the demo ────────────────────────────────────────────────────────────────────────
  //
  // A typed exchange, looping. It is decorative — `aria-hidden` on the container — so a screen
  // reader is not made to sit through a typing animation, and someone who asked for reduced
  // motion gets the finished text at once instead of the animation.
  var demo = document.getElementById('demo');
  if (demo) {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var script = [
      { who: 'me', text: 'لخّص لي هذا التقرير بثلاث نقاط، وقل لي ما الذي ينقصه.' },
      { who: 'ai', text: '١ · المبيعات ارتفعت ١٨٪ في الربع الثالث، ومصدر الارتفاع سوق واحدة.\n' +
                         '٢ · التكاليف ثابتة، فالهامش تحسّن بلا تغيير في التشغيل.\n' +
                         '٣ · التوقّع للربع الرابع مبنيّ على استمرار تلك السوق وحدها.\n\n' +
                         'ما ينقصه: لا يوجد رقم للعملاء المتكرّرين، وهو الرقم الذي يفصل بين نموّ ثابت وموسم جيّد.' }
    ];

    function bubble(who, text) {
      var el = document.createElement('div');
      el.className = 'bubble ' + who;
      el.textContent = text;
      demo.appendChild(el);
      return el;
    }

    function typeInto(el, text, done) {
      if (reduced) { el.textContent = text; done(); return; }
      var i = 0;
      var caret = document.createElement('span');
      caret.className = 'caret';
      el.appendChild(caret);
      var timer = setInterval(function () {
        i += 1;
        el.textContent = text.slice(0, i);
        el.appendChild(caret);
        if (i >= text.length) { clearInterval(timer); caret.remove(); done(); }
      }, 22);
    }

    function play(step) {
      if (step >= script.length) {
        // Hold the finished exchange for a while before starting over, so the page is not a
        // flicker in the corner of the visitor's eye while they read the rest of it.
        setTimeout(function () { demo.innerHTML = ''; play(0); }, 9000);
        return;
      }
      var line = script[step];
      var el = bubble(line.who, '');
      typeInto(el, line.text, function () {
        setTimeout(function () { play(step + 1); }, line.who === 'me' ? 550 : 400);
      });
    }

    play(0);
  }
})();
