/**
 * Wrapper IndexedDB tối giản (không dependency ngoài).
 * DB "etracker-offline" v1, 2 stores:
 *  - "expenses": hàng đợi khoản chi tạo khi server không đạt (keyPath "id")
 *  - "cache":    cache response API GET (keyPath "key")
 *
 * Môi trường không có IndexedDB (jsdom, WebView cũ) → Promise reject.
 */
const DB_NAME = "etracker-offline";
const DB_VERSION = 1;

const STORE_KEY_PATHS = {
  expenses: "id",
  cache: "key",
} as const;

export type StoreName = keyof typeof STORE_KEY_PATHS;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        (Object.keys(STORE_KEY_PATHS) as StoreName[]).forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: STORE_KEY_PATHS[name] });
          }
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Không mở được IndexedDB."));
    });
    // Open thất bại (VD private mode) → giải phóng để lần gọi sau thử lại
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function withStore<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (os: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = fn(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Lỗi IndexedDB."));
      }),
  );
}

export function idbPut(store: StoreName, value: unknown): Promise<IDBValidKey> {
  return withStore<IDBValidKey>(store, "readwrite", (os) => os.put(value));
}

export function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return withStore<T | undefined>(store, "readonly", (os) =>
    os.get(key) as IDBRequest<T | undefined>,
  );
}

export function idbGetAll<T>(store: StoreName): Promise<T[]> {
  return withStore<T[]>(store, "readonly", (os) => os.getAll() as IDBRequest<T[]>);
}

export function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  return withStore<void>(store, "readwrite", (os) => os.delete(key) as IDBRequest<void>);
}
