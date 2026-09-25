// The user's photo is kept on this device only (IndexedDB), so they don't have to upload it every visit.
// Nothing here ever touches the network.
const DB = 'head2toe'
const STORE = 'photos'
const KEY = 'me'

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null) // storage blocked (private mode) or unavailable
    }
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve((req.result as T) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export const photoStore = {
  get: () => run<Blob>('readonly', (s) => s.get(KEY) as IDBRequest<Blob>),
  set: async (b: Blob) => void (await run('readwrite', (s) => s.put(b, KEY))),
  clear: async () => void (await run('readwrite', (s) => s.delete(KEY))),
}
