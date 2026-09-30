export type StoredPlaylist = {
  id: string;
  name: string;
  url: string;
  channels: unknown[];
  updatedAt: string;
};

const DB_NAME = "m3u-stream-player";
const STORE_NAME = "playlists";
const LEGACY_KEY = "m3u-stream-playlists";

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("Cihaz depolaması açılamadı."));
});

const legacyPlaylists = (): StoredPlaylist[] => {
  try {
    const value = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

export async function loadPlaylists<T extends StoredPlaylist>(): Promise<T[]> {
  try {
    const db = await openDb();
    const values = await new Promise<StoredPlaylist[]>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    if (values.length) return values as T[];

    const legacy = legacyPlaylists();
    if (legacy.length) {
      await savePlaylists(legacy);
      localStorage.removeItem(LEGACY_KEY);
    }
    return legacy as T[];
  } catch {
    return legacyPlaylists() as T[];
  }
}

export async function savePlaylists(playlists: StoredPlaylist[]) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      playlists.forEach((playlist) => store.put(playlist));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    try { localStorage.setItem(LEGACY_KEY, JSON.stringify(playlists)); } catch { /* Quota dolarsa uygulama çalışmaya devam eder. */ }
  }
}
