// و٩٧ (R51) — the owner page's protocol: pairing a browser with a Braining PC through the relay, and
// sealed requests to it. Plain ES module, WebCrypto + WebSocket only, so the same file runs in the
// browser and in Node 22 (tools/security/viewer-pentest.mjs drives it against a real bridge + relay).
//
// Byte-for-byte the scheme of tools/bridge/relay-client.mjs and the phone's PcRelay.kt:
//   K    = HKDF-SHA256(SHA-256(token), salt "braining-relay-v1", info "k:" + deviceId)   (AES-256-GCM)
//   door = HKDF-SHA256(SHA-256(token), same salt, info "door:" + deviceId)             (relay v2 join key)
//   pair = HKDF-SHA256(SHA-256(one-time secret), same salt, info "pair:" + relay id)   (pairing frame)
//   box  = base64(nonce(12) ‖ ciphertext ‖ tag), aad "req|room|dev|id" / "res|…" / "pair|…" / "pairres|…"
// The device key is made NON-EXTRACTABLE: JavaScript (an XSS included) can use it while the page is
// open, never export it. The token itself is used once, to derive the keys, and is not kept.

const SALT = new TextEncoder().encode('braining-relay-v1')
const PART = 600 * 1024
const enc = (s) => new TextEncoder().encode(s)
const dec = (b) => new TextDecoder().decode(b)
const subtle = () => globalThis.crypto.subtle

export function b64(bytes) {
  let s = ''
  const u = new Uint8Array(bytes)
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000))
  return btoa(s)
}
export function unb64(text) {
  const s = atob(String(text).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
const b64url = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function randomId(n = 16) {
  return b64url(globalThis.crypto.getRandomValues(new Uint8Array(n))).slice(0, n)
}

/** The link the PC showed: `…/owner/#p=<base64url JSON>`. Null when it is not one. */
export function decodeLink(hash) {
  const m = String(hash || '').match(/[#&]p=([A-Za-z0-9_-]{20,4000})/)
  if (!m) return null
  try {
    const o = JSON.parse(dec(unb64(m[1])))
    if (o.v !== 1 || !/^wss?:\/\//.test(o.r) || !/^[A-Za-z0-9_-]{16,64}$/.test(o.room) || String(o.k).length < 32 || String(o.s).length < 16) return null
    return { relay: o.r, room: o.room, roomKey: o.k, secret: o.s, bridgeId: String(o.id || ''), pcName: String(o.n || '') }
  } catch { return null }
}

async function hkdf(ikmText, info, extractable = false) {
  const ikm = await subtle().digest('SHA-256', enc(ikmText))
  const base = await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveKey', 'deriveBits'])
  return {
    key: await subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc(info) }, base, { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']),
    bits: async () => new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc(info) }, base, 256)),
  }
}

/** The device's keys from its token: a non-extractable AES key and the relay door (a string). */
export async function deviceKeys(token, deviceId) {
  const k = await hkdf(token, 'k:' + deviceId)
  const door = b64url(await (await hkdf(token, 'door:' + deviceId)).bits())
  return { key: k.key, door }
}

export async function seal(key, aad, plainBytes) {
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce, additionalData: enc(aad) }, key, plainBytes))
  const all = new Uint8Array(12 + ct.length)
  all.set(nonce); all.set(ct, 12)
  return b64(all)
}

export async function open(key, aad, text) {
  const all = unb64(text)
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: all.subarray(0, 12), additionalData: enc(aad) }, key, all.subarray(12)))
}

/**
 * One WebSocket to the relay room as device [dev], joined with [joinKey] (a door, or the room key).
 * Events: onPresence(pcConnected), onClosed(code). Requests wait for their own id only.
 */
export class RelayLink {
  constructor({ relay, room, dev, joinKey, onPresence = () => {}, onClosed = () => {} }) {
    Object.assign(this, { relay, room, dev, joinKey, onPresence, onClosed })
    this.pc = null
    this.waiting = new Map()
    this.parts = new Map()
    this.ws = null
  }

  connect(timeoutMs = 10_000) {
    const url = `${this.relay.replace(/\/+$/, '')}/v1/room/${this.room}/ws?role=phone&dev=${encodeURIComponent(this.dev)}&key=${encodeURIComponent(this.joinKey)}`
    return new Promise((resolve, reject) => {
      let settled = false
      const ws = new WebSocket(url)
      const timer = setTimeout(() => { if (!settled) { settled = true; try { ws.close() } catch {} ; reject(new Error('relay_timeout')) } }, timeoutMs)
      ws.onopen = () => { if (!settled) { settled = true; clearTimeout(timer); this.ws = ws; resolve(this) } }
      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error('relay_refused')) } }
      ws.onclose = (e) => {
        if (this.ws === ws) this.ws = null
        for (const w of this.waiting.values()) w.reject(new Error('relay_closed'))
        this.waiting.clear()
        if (settled) this.onClosed(e.code)
      }
      ws.onmessage = (e) => this.onMessage(String(e.data))
    })
  }

  onMessage(text) {
    if (text === 'pong') return
    let m
    try { m = JSON.parse(text) } catch { return }
    if (m.type === 'presence') { this.pc = m.pc === true; this.onPresence(this.pc); for (const w of this.presenceWaiters || []) w(this.pc); this.presenceWaiters = []; return }
    if (m.type === 'undeliverable') { this.waiting.get(m.id)?.reject(new Error('pc_offline')); return }
    if (m.type !== 'frame' || !this.waiting.has(m.id)) return
    const total = Number(m.parts) || 1
    if (total < 1 || total > 64) return
    const slot = this.parts.get(m.id) || new Array(total)
    slot[Number(m.part) || 0] = String(m.data || '')
    this.parts.set(m.id, slot)
    if ([...slot].every((x) => typeof x === 'string')) { this.parts.delete(m.id); this.waiting.get(m.id).resolve(slot.join('')) }
  }

  /** Waits (≤ ms) until the relay has said whether the PC is there; true when it is. */
  async pcHere(ms = 4000) {
    if (this.pc !== null) return this.pc
    return await new Promise((resolve) => {
      this.presenceWaiters = [...(this.presenceWaiters || []), resolve]
      setTimeout(() => resolve(this.pc === true), ms)
    })
  }

  /** Send sealed [text] under request [id]; resolves with the sealed answer's text. */
  send(id, sealedText, timeoutMs) {
    if (!this.ws) return Promise.reject(new Error('relay_closed'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting.delete(id); reject(new Error('pc_timeout')) }, timeoutMs)
      this.waiting.set(id, {
        resolve: (v) => { clearTimeout(timer); this.waiting.delete(id); resolve(v) },
        reject: (e) => { clearTimeout(timer); this.waiting.delete(id); reject(e) },
      })
      const count = Math.max(1, Math.ceil(sealedText.length / PART))
      for (let i = 0; i < count; i++) {
        this.ws.send(JSON.stringify({ type: 'frame', id, part: i, parts: count, data: sealedText.slice(i * PART, (i + 1) * PART) }))
      }
    })
  }

  ping() { try { this.ws?.send('ping') } catch {} }
  close() { try { this.ws?.close() } catch {} ; this.ws = null }
}

/**
 * Pair this browser through the relay with the link's one-time secret. Returns
 * { deviceId, key, door, bridgeId, pcName, status } — the token is used to derive the keys and
 * dropped. [exposeToken] exists for the isolated test harness only; the page never passes it.
 */
export async function pairBrowser(link, name, { exposeToken = false, timeoutMs = 20_000 } = {}) {
  const dev = 'pair-' + randomId(16)
  const relay = new RelayLink({ relay: link.relay, room: link.room, dev, joinKey: link.roomKey })
  await relay.connect()
  try {
    if (!(await relay.pcHere(6000))) throw new Error('pc_offline')
    const pk = (await hkdf(link.secret, 'pair:' + dev)).key
    const id = randomId(22)
    const sealed = await seal(pk, `pair|${link.room}|${dev}|${id}`, enc(JSON.stringify({ t: Date.now(), name: String(name || '').slice(0, 60) })))
    const answer = await relay.send(id, sealed, timeoutMs)
    const o = JSON.parse(dec(await open(pk, `pairres|${link.room}|${dev}|${id}`, answer)))
    if (o.error) throw Object.assign(new Error(o.error.code || 'pairing_refused'), { detail: o.error.message })
    if (!o.token || !/^[0-9a-f]{12}$/.test(o.deviceId || '')) throw new Error('pairing_refused')
    const keys = await deviceKeys(o.token, o.deviceId)
    return { deviceId: o.deviceId, key: keys.key, door: keys.door, bridgeId: o.bridgeId || link.bridgeId, pcName: o.name || link.pcName, status: o.status, ...(exposeToken ? { token: o.token } : {}) }
  } finally { relay.close() }
}

/**
 * A paired browser's session with its PC: join (door first, the room key on a v1 relay), then
 * sealed requests. `call` → { status, json }; errors: pc_offline, pc_timeout, relay_refused, removed.
 */
export class PcSession {
  constructor(device, { onPresence = () => {}, onClosed = () => {} } = {}) {
    this.device = device // { relay, room, roomKey, deviceId, key, door }
    this.onPresence = onPresence
    this.onClosed = onClosed
    this.link = null
  }

  async join() {
    if (this.link?.ws) return this.link
    const d = this.device
    const make = (joinKey) => new RelayLink({ relay: d.relay, room: d.room, dev: d.deviceId, joinKey, onPresence: this.onPresence, onClosed: (c) => { this.link = null; this.onClosed(c) } })
    try { this.link = await make(d.door).connect() } catch {
      // A v1 relay has no doors: the room key from the pairing link.
      this.link = await make(d.roomKey).connect()
    }
    return this.link
  }

  async call(method, path, body = null, timeoutMs = 20_000) {
    const link = await this.join()
    if (!(await link.pcHere(4000))) throw new Error('pc_offline')
    const d = this.device
    const id = randomId(22)
    const request = { method, path, t: Date.now() }
    if (body != null) { request.contentType = 'application/json'; request.body = b64(enc(JSON.stringify(body))) }
    const sealed = await seal(d.key, `req|${d.room}|${d.deviceId}|${id}`, enc(JSON.stringify(request)))
    const answer = await link.send(id, sealed, timeoutMs)
    const o = JSON.parse(dec(await open(d.key, `res|${d.room}|${d.deviceId}|${id}`, answer)))
    let json = null
    try { json = JSON.parse(dec(unb64(o.body || ''))) } catch { /* not JSON */ }
    return { status: Number(o.status) || 502, json }
  }

  close() { this.link?.close(); this.link = null }
}
