// و٩٧ (R51) — what the owner page keeps in THIS browser: the paired device (ids, the relay address,
// the room key, the door key, and the device key as a NON-EXTRACTABLE CryptoKey — IndexedDB keeps a
// CryptoKey as it is, so JavaScript can use it but never read it out) and the last snapshot shown
// (agenda + notices, for when the PC is off). Nothing else; «أزل هذا المتصفّح» wipes it all.

const DB = 'braining-owner'
const STORE = 'kv'

function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

async function tx(mode, fn) {
  const d = await db()
  return await new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => { d.close(); resolve(req?.result) }
    t.onerror = () => { d.close(); reject(t.error) }
  })
}

export const get = (key) => tx('readonly', (s) => s.get(key))
export const put = (key, value) => tx('readwrite', (s) => s.put(value, key))
export const wipe = () => new Promise((resolve) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => resolve() })
