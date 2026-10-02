// و٩٧ (R51) — the owner page's screens. The protocol is owner-core.js (also driven by the tests);
// what this browser keeps is owner-store.js. Every text set here goes through textContent: nothing
// from the PC, the relay or the link becomes markup.
import { decodeLink, pairBrowser, PcSession } from './owner-core.js'
import * as store from './owner-store.js'

const $ = (id) => document.getElementById(id)
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تمّوز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول']
const TZ = 180 // the PC's agenda is in Asia/Damascus, +03:00
const ERR = {
  pc_offline: 'حاسوبك غير متّصل الآن.', pc_timeout: 'لم يجب حاسوبك. إن تكرّر: تحقّق أنّ ساعة هذا الجهاز مضبوطة.',
  relay_refused: 'تعذّر الوصول إلى الوسيط.', relay_timeout: 'الوسيط لا يجيب.', relay_closed: 'انقطع الاتّصال بالوسيط.',
  no_master: 'اقرن هاتفك أوّلاً: هو الجهاز الرئيس الذي يوافق على هذا المتصفّح.', pairing_refused: 'رُفض الربط.',
}
const say = (e) => ERR[e?.message] || e?.detail || 'تعذّر ذلك الآن.'

// A page that is framed refuses to run (a click on «تمّ» must be his own).
if (window.top !== window.self) { document.documentElement.textContent = 'لا تُفتح هذه الصفحة داخل إطار.'; throw new Error('framed') }

function theme() {
  const root = document.documentElement, KEY = 'braining-owner-theme'
  const apply = (t) => (t === 'light' || t === 'dark' ? root.setAttribute('data-theme', t) : root.removeAttribute('data-theme'))
  try { apply(localStorage.getItem(KEY)) } catch {}
  $('theme').onclick = () => {
    const cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    const next = cur === 'dark' ? 'light' : 'dark'; apply(next); try { localStorage.setItem(KEY, next) } catch {}
  }
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e }
function toast(t) { const e = $('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => { e.style.display = 'none' }, 2800) }
function show(id) { for (const s of ['welcome', 'pair', 'main']) $(s).hidden = s !== id }
function state(text, cls) { const c = $('state'); c.hidden = !text; c.textContent = text || ''; c.className = 'chip ' + (cls || '') }
function banner(text, off) { const b = $('banner'); b.hidden = !text; b.textContent = text || ''; b.className = 'banner' + (off ? ' off' : '') }
const local = (iso) => { const d = new Date(Date.parse(iso) + TZ * 60000); return { day: d.toISOString().slice(0, 10), hm: d.toISOString().slice(11, 16) } }
const todayLocal = () => local(new Date().toISOString()).day
function dayTitle(day) {
  const d = new Date(day + 'T00:00:00Z'), diff = Math.round((d - Date.parse(todayLocal() + 'T00:00:00Z')) / 86400000)
  return [diff === 0 ? 'اليوم' : diff === 1 ? 'غداً' : diff === -1 ? 'أمس' : DAYS[d.getUTCDay()], d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]]
}
function browserName() {
  const ua = navigator.userAgent
  const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'متصفّح'
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return ('متصفّح · ' + b + (os ? ' · ' + os : '')).slice(0, 60)
}

// ── pairing ───────────────────────────────────────────────────────────────────────────────────
async function offerPairing(link) {
  show('pair')
  $('pcName').textContent = link.pcName || 'حاسوبك'
  $('deviceName').value = browserName()
  $('pairCancel').onclick = () => start()
  $('pairBtn').onclick = async () => {
    $('pairBtn').disabled = true
    $('pairMsg').className = 'msg'; $('pairMsg').textContent = 'يربط عبر الوسيط…'
    try {
      const d = await pairBrowser(link, $('deviceName').value.trim() || browserName())
      await store.put('device', {
        relay: link.relay, room: link.room, roomKey: link.roomKey, bridgeId: d.bridgeId, pcName: d.pcName,
        deviceId: d.deviceId, key: d.key, door: d.door, name: $('deviceName').value.trim() || browserName(), pairedAt: new Date().toISOString(),
      })
      await start()
    } catch (e) {
      $('pairMsg').className = 'msg bad'
      $('pairMsg').textContent = e.message === 'pc_timeout' ? 'لم يقبل حاسوبك الرابط: ربّما استُعمل أو انتهت مدّته (١٠ دقائق). أنشئ رابطاً جديداً.' : say(e)
      $('pairBtn').disabled = false
    }
  }
}

// ── the paired view ───────────────────────────────────────────────────────────────────────────
let session = null, device = null, snap = { items: [], notices: [], latest: 0, at: null }, polling = false

function renderAgenda() {
  const days = $('days'), undated = $('undated')
  days.textContent = ''; undated.textContent = ''
  const groups = {}
  for (const o of snap.items) {
    if (!o.start) { undated.appendChild(item(o)); continue }
    const d = local(o.start).day
    if (d < todayLocal() && o.status === 'done') continue
    ;(groups[d] = groups[d] || []).push(o)
  }
  const keys = Object.keys(groups).sort()
  if (!keys.length) days.appendChild(el('div', 'empty', snap.at ? 'لا مواعيد في الأيام القادمة.' : 'لم يصل التقويم بعد.'))
  for (const d of keys) {
    const box = el('section', 'day'), [name, date] = dayTitle(d), h = el('h3')
    h.appendChild(el('b', '', name)); h.appendChild(el('span', '', date)); box.appendChild(h)
    for (const o of groups[d]) box.appendChild(item(o))
    days.appendChild(box)
  }
  if (!undated.childNodes.length) undated.appendChild(el('div', 'empty', 'لا مهامّ بلا موعد.'))
}

function item(o) {
  const late = o.start && o.status !== 'done' && Date.parse(o.start) < Date.now()
  const r = el('div', 'item' + (o.status === 'done' ? ' done' : '') + (late ? ' late' : ''))
  r.appendChild(el('div', 'time', o.start ? local(o.start).hm : '—'))
  const b = el('div', 'body'); b.appendChild(el('div', 'title', o.title))
  const m = el('div', 'meta'); m.appendChild(el('span', 'kind k-' + String(o.kind).replace(/[^a-z-]/g, ''), o.kindLabel || o.kind))
  if (late) m.appendChild(el('span', '', 'فات موعده'))
  if (o.status === 'moved') m.appendChild(el('span', '', 'نُقل'))
  if (o.recurring) m.appendChild(el('span', '', 'متكرّر'))
  b.appendChild(m); r.appendChild(b)
  const acts = el('div', 'acts')
  const done = el('button', 'btn small', o.status === 'done' ? 'أعِده' : 'تمّ ✓')
  done.onclick = () => change(o, { status: o.status === 'done' ? 'todo' : 'done' })
  acts.appendChild(done)
  if (o.status !== 'done') { const later = el('button', 'btn small', 'أجِّل'); later.onclick = () => r.classList.toggle('moving'); acts.appendChild(later) }
  r.appendChild(acts)
  const mv = el('div', 'move'), di = el('input'), ti = el('input'), save = el('button', 'btn small primary', 'احفظ')
  di.type = 'date'; ti.type = 'time'; di.value = o.start ? local(o.start).day : todayLocal(); ti.value = o.start ? local(o.start).hm : '10:00'
  save.onclick = () => change(o, { start: new Date(Date.parse(di.value + 'T' + ti.value + ':00+03:00')).toISOString() })
  mv.appendChild(di); mv.appendChild(ti); mv.appendChild(save); r.appendChild(mv)
  return r
}

async function change(o, body) {
  try {
    const r = await session.call('POST', '/v1/agenda/' + o.id, body)
    if (r.status !== 200) throw new Error(r.json?.error?.code || 'refused')
    toast(body.status === 'done' ? 'تمّ.' : body.status ? 'أُعيد.' : 'نُقل.')
    await refresh()
  } catch (e) { toast(say(e)) }
}

function renderNotices(fresh = new Set()) {
  const ul = $('notices'); ul.textContent = ''
  if (!snap.notices.length) { ul.appendChild(el('li', '', 'لا إشعارات بعد.')); return }
  for (const n of snap.notices.slice(0, 30)) {
    const li = el('li', String(n.kind || '').replace(/[^a-z]/g, '') + (fresh.has(n.seq) ? ' fresh' : ''))
    li.appendChild(el('b', '', n.title)); if (n.body) li.appendChild(el('span', '', n.body))
    li.appendChild(el('small', '', new Date(n.at).toLocaleString('ar-SY-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' })))
    ul.appendChild(li)
  }
}

async function saveSnap() { snap.at = new Date().toISOString(); try { await store.put('snapshot', snap) } catch {} }

async function refresh() {
  const me = await session.call('GET', '/v1/me')
  if (me.status === 200 && me.json?.status === 'pending') {
    state('بانتظار الموافقة', 'wait')
    banner('بانتظار موافقة هاتفك: على هاتفك ⚙ الإعدادات ← الأجهزة ← «' + (device.name || 'هذا المتصفّح') + '» ← «وافق». هذه الصفحة تتحقّق كلّ ١٠ ثوانٍ.')
    return false
  }
  if (me.status !== 200) throw new Error(me.json?.error?.code || 'refused')
  const a = await session.call('GET', '/v1/agenda?days=21')
  if (a.status === 200) snap.items = a.json.connected ? a.json.items : []
  const n = await session.call('GET', '/v1/notices?after=0')
  if (n.status === 200) { snap.notices = [...n.json.items].reverse(); snap.latest = n.json.latest }
  state('حاسوبك متّصل', 'on'); banner('')
  $('sub').textContent = 'حاسوب «' + (device.pcName || '') + '» · للعرض فقط'
  if (a.status === 200 && !a.json.connected) banner('لا تقويم على هذا الحاسوب بعد (BRIDGE_AGENDA_FILE).')
  renderAgenda(); renderNotices(); await saveSnap()
  return true
}

async function poll() {
  if (polling) return
  polling = true
  try {
    for (;;) {
      const r = await session.call('GET', `/v1/notices?after=${snap.latest || 0}&wait=25`, null, 40_000)
      if (r.status !== 200) break
      const fresh = new Set()
      for (const x of r.json.items) { if (!snap.notices.some((y) => y.seq === x.seq)) { snap.notices.unshift(x); fresh.add(x.seq); alertOf(x) } }
      snap.latest = r.json.latest
      if (fresh.size) { renderNotices(fresh); await saveSnap(); if ([...fresh].length) refresh().catch(() => {}) }
    }
  } catch (e) { offline(e) } finally { polling = false }
}

function alertOf(n) {
  try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(n.title, { body: n.body || '' }) } catch {}
}

function offline(e) {
  state('حاسوبك غير متّصل', 'off')
  banner(say(e) + (snap.at ? ' — تعرض الصفحة آخر ما وصلها: ' + new Date(snap.at).toLocaleString('ar-SY-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : ''), true)
}

async function removed() {
  session?.close(); await store.wipe()
  $('sub').textContent = 'تقويم حاسوبك وإشعاراته — للعرض فقط'
  banner(''); state('')
  show('welcome')
  toast('أُزيل هذا المتصفّح من أجهزتك.')
}

async function openMain(d) {
  device = d
  show('main')
  snap = (await store.get('snapshot').catch(() => null)) || snap
  renderAgenda(); renderNotices()
  $('deviceInfo').textContent = 'مقترن منذ ' + new Date(d.pairedAt).toLocaleDateString('ar-SY-u-nu-latn') + ' · المفتاح محفوظ هنا ولا يُقرأ.'
  $('forget').onclick = async () => {
    if (!confirm('أزل هذا المتصفّح من أجهزة حاسوبك؟ تحتاج رابطاً جديداً لتربطه ثانية.')) return
    try { await session.call('POST', `/v1/devices/${d.deviceId}/remove`, {}, 5000) } catch { /* it is gone either way */ }
    await removed()
  }
  if ('Notification' in window && Notification.permission === 'default') {
    $('alertBtn').hidden = false
    $('alertBtn').onclick = async () => { await Notification.requestPermission(); $('alertBtn').hidden = true }
  }
  session = new PcSession(d, {
    onPresence: (pc) => { if (pc) { state('حاسوبك متّصل', 'on'); cycle() } else offline(new Error('pc_offline')) },
    // 4001: its door was closed — removed from «الأجهزة». Anything else: the link dropped.
    onClosed: (code) => { if (code === 4001) removed(); else { offline(new Error('relay_closed')); setTimeout(cycle, 15_000) } },
  })
  cycle()
  setInterval(() => { if (!document.hidden) cycle() }, 120_000)
}

let cycling = false
async function cycle() {
  if (cycling || !session) return
  cycling = true
  try {
    for (let i = 0; i < 360; i++) { // pending: ask again every 10 s for up to an hour
      if (await refresh()) { poll(); break }
      await new Promise((r) => setTimeout(r, 10_000))
    }
  } catch (e) { offline(e) } finally { cycling = false }
}

async function start() {
  const link = decodeLink(location.hash)
  // The link is a secret: out of the address bar and the history at once.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search)
  const d = await store.get('device').catch(() => null)
  if (link) {
    if (d && !confirm('هذا المتصفّح مربوط بحاسوب «' + (d.pcName || '') + '». استبدل الربط؟')) return openMain(d)
    return offerPairing(link)
  }
  if (d) return openMain(d)
  show('welcome')
}

theme()
start()
