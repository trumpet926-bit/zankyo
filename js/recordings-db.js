// 録音データの保存（ブラウザ内のデータベース IndexedDB を使う）

const DB_NAME = 'practice-app';
const DB_STORE = 'recordings';

function openRecordingsDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withRecordingsStore(mode, fn) {
  const db = await openRecordingsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode);
    const req = fn(tx.objectStore(DB_STORE));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}

// 録音1件：{ id, createdAt, duration(秒), blob }
const recordingsDb = {
  all: () => withRecordingsStore('readonly', (store) => store.getAll()),
  add: (rec) => withRecordingsStore('readwrite', (store) => store.put(rec)),
  remove: (id) => withRecordingsStore('readwrite', (store) => store.delete(id)),
};
