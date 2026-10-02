export type StoredPlaylist = {
  id: string;
  name: string;
  url: string;
  channels: unknown[];
  updatedAt: string;
};

export type UserPrefs = {
  favorites: string[];
  recent: string[];
  hidden: string[];
  carMode: boolean;
  sort: "default" | "name" | "recent";
};

const DB_NAME = "m3u-stream-player";
const PLAYLIST_STORE = "playlists";
const PREFS_STORE = "preferences";
const PREFS_ID = "user";
const LEGACY_KEY = "m3u-stream-playlists";
const DEFAULT_PREFS: UserPrefs = { favorites: [], recent: [], hidden: [], carMode: true, sort: "default" };

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 2);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(PLAYLIST_STORE)) db.createObjectStore(PLAYLIST_STORE, { keyPath: "id" });
    if (!db.objectStoreNames.contains(PREFS_STORE)) db.createObjectStore(PREFS_STORE, { keyPath: "id" });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("Cihaz depolaması açılamadı."));
});

const legacyPlaylists = (): StoredPlaylist[] => {
  try { const value = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
};

export async function loadPlaylists<T extends StoredPlaylist>(): Promise<T[]> {
  try {
    const db = await openDb();
    const values = await new Promise<StoredPlaylist[]>((resolve, reject) => {
      const request = db.transaction(PLAYLIST_STORE, "readonly").objectStore(PLAYLIST_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error);
    });
    if (values.length) return values as T[];
    const legacy = legacyPlaylists();
    if (legacy.length) { await savePlaylists(legacy); localStorage.removeItem(LEGACY_KEY); }
    return legacy as T[];
  } catch { return legacyPlaylists() as T[]; }
}

export async function savePlaylists(playlists: StoredPlaylist[]) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PLAYLIST_STORE, "readwrite"); const store = transaction.objectStore(PLAYLIST_STORE);
      store.clear(); playlists.forEach((playlist) => store.put(playlist));
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    });
  } catch { try { localStorage.setItem(LEGACY_KEY, JSON.stringify(playlists)); } catch { /* cihaz alanı doluysa uygulama çalışır */ } }
}

export async function loadPrefs(): Promise<UserPrefs> {
  try {
    const db = await openDb();
    return await new Promise<UserPrefs>((resolve) => {
      const request = db.transaction(PREFS_STORE, "readonly").objectStore(PREFS_STORE).get(PREFS_ID);
      request.onsuccess = () => resolve({ ...DEFAULT_PREFS, ...(request.result?.value || {}) });
      request.onerror = () => resolve(DEFAULT_PREFS);
    });
  } catch { return DEFAULT_PREFS; }
}

export async function savePrefs(prefs: UserPrefs) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(PREFS_STORE, "readwrite"); transaction.objectStore(PREFS_STORE).put({ id: PREFS_ID, value: prefs });
      transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve();
    });
  } catch { /* tercihler geçici olarak bellekte kalabilir */ }
}
