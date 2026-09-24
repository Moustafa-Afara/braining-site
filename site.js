// Braining site — the whole script (E, 2026-09-25). No dependencies, no requests, no storage but
// two per-visitor conveniences (language, theme), each wrapped because storage can be refused.
(() => {
  const root = document.documentElement
  const store = {
    get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
    set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
  }

  // ── theme ──────────────────────────────────────────────────────────────────
  const savedTheme = store.get('theme')
  if (savedTheme) root.dataset.theme = savedTheme
  const themeBtn = document.getElementById('theme')
  if (themeBtn) themeBtn.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    root.dataset.theme = dark ? 'light' : 'dark'
    store.set('theme', root.dataset.theme)
  })

  // ── language: English first; Arabic for an Arabic browser or when chosen ─────
  const hasBilingual = !!document.querySelector('[data-en]')
  // ?lang=ar / ?lang=en in a shared link wins; then the visitor's own choice; then the browser.
  const asked = new URLSearchParams(location.search).get('lang')
  let lang = (asked === 'ar' || asked === 'en') ? asked
    : store.get('lang') || ((navigator.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en')
  function applyLang() {
    if (!hasBilingual) return
    root.lang = lang
    root.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.querySelectorAll('[data-en]').forEach((el) => {
      const html = el.getAttribute('data-' + lang)
      if (html != null) el.innerHTML = html
    })
    document.title = lang === 'ar'
      ? 'Braining «فهم» — كلّ نماذج الذكاء الاصطناعي، بمفاتيحك وعلى حاسوبك'
      : 'Braining «فهم» — every AI model, your keys, your computer'
    if (typeof playScene === 'function' && current) playScene(current)
  }
  const langBtn = document.getElementById('lang')
  if (langBtn) langBtn.addEventListener('click', () => { lang = lang === 'ar' ? 'en' : 'ar'; store.set('lang', lang); applyLang() })

  // ── reveal on scroll ───────────────────────────────────────────────────────
  const reveals = document.querySelectorAll('.reveal')
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
    }), { threshold: 0.12 })
    reveals.forEach((el) => io.observe(el))
  } else reveals.forEach((el) => el.classList.add('in'))

  // ── the phone: short scripted scenes, played on demand ──────────────────────
  const thread = document.getElementById('thread')
  const model = document.getElementById('scene-model')
  const route = document.getElementById('scene-route')
  const T = (en, ar) => (lang === 'ar' ? ar : en)
  const SCENES = {
    chat: () => ({
      model: 'Claude · claude-opus', route: T('home network', 'شبكة البيت'),
      steps: [
        { me: T('Summarise this week\'s sales report in three lines', 'لخّص تقرير مبيعات هذا الأسبوع في ثلاثة أسطر') },
        { it: T('Sales rose 8% on last week, led by the new bundle. Returns fell. One region lags — worth a look before Monday.', 'ارتفعت المبيعات ٨٪ عن الأسبوع الماضي بفضل الباقة الجديدة. وانخفضت المرتجعات. منطقة واحدة متأخّرة — تستحقّ نظرة قبل الاثنين.'), meta: T('first word 1.4 s · Claude', 'أوّل كلمة ١٫٤ ث · Claude') },
      ],
    }),
    voice: () => ({
      model: 'Whisper · ' + T('your PC', 'حاسوبك'), route: T('home network', 'شبكة البيت'),
      steps: [
        { wave: true },
        { me: T('Remind me what I planned for tomorrow', 'ذكّرني بشو خطّطت لبكرا') },
        { it: T('Tomorrow: the dentist at 10, then finishing the slides. Shall I read it aloud?', 'بكرا: موعد طبيب الأسنان الساعة ١٠، ثم إنهاء الشرائح. أقرؤها لك بصوت عالٍ؟'), meta: T('read aloud by your PC · Piper', 'يقرؤها حاسوبك · Piper') },
      ],
    }),
    picture: () => ({
      model: 'SD-Turbo · ' + T('your PC', 'حاسوبك'), route: T('free', 'مجاني'),
      steps: [
        { me: T('Draw an orange cat programming on a laptop', 'ارسم قطّاً برتقالياً يبرمج على حاسوب محمول') },
        { it: T('An orange cat sitting on a laptop, paws on the keys…', 'An orange cat sitting on a laptop, paws on the keys…'), meta: T('the command, written subject first', 'الأمر، يبدأ بالموضوع') },
        { pic: true, meta: T('SD-Turbo · 12 s · free — or redraw with FLUX', 'SD-Turbo · ١٢ ث · مجاني — أو ارسمها بـ FLUX') },
      ],
    }),
    pc: () => ({
      model: T('Your PC · bridge', 'حاسوبك · الجسر'), route: 'Tailscale',
      steps: [
        { me: T('On my PC: rename the invoices in Downloads by date', 'على حاسوبي: أعد تسمية الفواتير في التنزيلات حسب التاريخ') },
        { it: T('This will rename files. Allow?', 'هذا سيعيد تسمية ملفّات. تسمح؟'), meta: T('the bridge asks — not the model', 'الجسر يستأذن — لا النموذج') },
        { me: T('Allow', 'اسمح') },
        { it: T('Done: 14 files renamed. Here is exactly what changed.', 'تمّ: أُعيدت تسمية الملفّات. هذا ما تغيّر بالضبط.'), meta: T('report from your computer', 'تقرير من حاسوبك') },
      ],
    }),
    clarify: () => ({
      model: T('Braining mode', 'نمط الفهم'), route: T('several models', 'عدّة نماذج'),
      steps: [
        { me: T('I want to start a small online shop', 'أريد أن أفتح متجراً صغيراً على الإنترنت') },
        { it: T('Before I plan it: what will you sell, and to whom?', 'قبل أن أخطّط: ماذا ستبيع، ولمن؟'), meta: T('one question at a time', 'سؤال واحد في كلّ مرّة') },
        { me: T('Handmade soap, to people in my city', 'صابون يدوي، لأهل مدينتي') },
        { it: T('Plan ready: suppliers, pricing, a first page and a launch week — each step on the model that suits it.', 'الخطّة جاهزة: المورّدون، التسعير، صفحة أولى وأسبوع إطلاق — كلّ خطوة على النموذج الأنسب لها.'), meta: T('step by step, reasons shown', 'خطوةً خطوة، مع ذكر السبب') },
      ],
    }),
  }
  let current = thread ? 'chat' : null
  let timers = []
  function bubble(step) {
    const b = document.createElement('div')
    if (step.wave) { b.className = 'bubble me'; b.innerHTML = '<span class="wave"><i></i><i></i><i></i><i></i><i></i></span>' }
    else if (step.pic) { b.className = 'bubble it pic'; b.innerHTML = '<div class="art" aria-hidden="true"></div>' }
    else { b.className = 'bubble ' + (step.me != null ? 'me' : 'it'); b.textContent = step.me != null ? step.me : step.it }
    if (step.meta) { const m = document.createElement('span'); m.className = 'meta'; m.textContent = step.meta; b.appendChild(m) }
    return b
  }
  function playScene(name) {
    if (!thread) return
    current = name
    timers.forEach(clearTimeout); timers = []
    thread.innerHTML = ''
    const scene = SCENES[name]()
    model.textContent = scene.model
    route.textContent = scene.route
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    scene.steps.forEach((step, i) => {
      timers.push(setTimeout(() => {
        if (step.wave && thread.lastChild === null) { /* first step */ }
        thread.appendChild(bubble(step))
        // The waveform is replaced by the words it became.
        if (!step.wave && thread.querySelector('.wave')) thread.querySelector('.wave').closest('.bubble').remove()
      }, reduced ? 0 : i * 1100))
    })
  }
  document.querySelectorAll('[data-scene]').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('[data-scene]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)))
    playScene(btn.dataset.scene)
  }))

  // ── the connection diagram ─────────────────────────────────────────────────
  function showRoute(name) {
    document.querySelectorAll('.net .link').forEach((g) => g.classList.toggle('on', g.dataset.route === name))
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name })
    document.querySelectorAll('[data-show]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.show === name)))
  }
  document.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => showRoute(b.dataset.show)))
  document.querySelectorAll('.net .link').forEach((g) => g.addEventListener('click', () => showRoute(g.dataset.route)))
  if (document.querySelector('.net')) showRoute('home')

  applyLang() // also plays the first scene
})()
