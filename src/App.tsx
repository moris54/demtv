import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, LayoutGrid, Library, Link2, Loader2, Plus, RefreshCw, Search, Trash2, Tv, X } from "lucide-react";
import { parseM3U, type Channel } from "./m3u";
import { Player } from "./Player";
import { proxyUrl } from "./stream";

type Playlist = { id: string; name: string; url: string; channels: Channel[]; updatedAt: string };
const STORE = "m3u-stream-playlists";
const ALL = "Tümü";

const repairChannelUrl = (channel: Channel): Channel => {
  try {
    const original = new URL(channel.url, window.location.origin).searchParams.get("url");
    return original ? { ...channel, url: original } : channel;
  } catch { return channel; }
};
const readSaved = (): Playlist[] => {
  try {
    const value = JSON.parse(localStorage.getItem(STORE) || "[]");
    if (!Array.isArray(value)) return [];
    return value.map((p) => ({ ...p, channels: Array.isArray(p.channels) ? p.channels.map(repairChannelUrl) : [] }));
  } catch { return []; }
};
const pickInitialChannel = (channels: Channel[]) =>
  channels.find((c) => /(?:\.m3u8?|m3u)(?:$|[?#])/i.test(c.url)) || channels[0];
const tr = (s: string) => s.toLocaleLowerCase("tr");

function Logo({ channel }: { channel: Channel }) {
  const [failed, setFailed] = useState(false);
  const initials = channel.name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span className="logo">
      {channel.logo && !failed
        ? <img src={channel.logo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : initials ? <b>{initials}</b> : <Tv size={26} />}
    </span>
  );
}

function App() {
  const [playlists, setPlaylists] = useState<Playlist[]>(readSaved);
  const [activeId, setActiveId] = useState<string>();
  const [selected, setSelected] = useState<Channel>();
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string }>();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => readSaved().length === 0);
  const [awake, setAwake] = useState(true);
  const idleTimer = useRef<number>();
  const noticeTimer = useRef<number>();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const activeCard = useRef<HTMLButtonElement>(null);

  useEffect(() => localStorage.setItem(STORE, JSON.stringify(playlists)), [playlists]);
  useEffect(() => { if (!activeId && playlists[0]) setActiveId(playlists[0].id); }, [activeId, playlists]);

  const wake = useCallback(() => {
    setAwake(true);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setAwake(false), 4000);
  }, []);
  useEffect(() => { wake(); return () => window.clearTimeout(idleTimer.current); }, [wake]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setLibraryOpen(false); setPanelOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (panelOpen) activeCard.current?.scrollIntoView({ block: "center" }); }, [panelOpen]);

  const active = playlists.find((p) => p.id === activeId) || playlists[0];
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    (active?.channels || []).forEach((c) => map.set(c.group || "Diğer", (map.get(c.group || "Diğer") || 0) + 1));
    return map;
  }, [active]);
  const categories = useMemo(() => [ALL, ...Array.from(counts.keys()).sort((a, b) => a.localeCompare(b, "tr"))], [counts]);
  const channels = useMemo(() => {
    const q = tr(query.trim());
    return (active?.channels || []).filter((c) => (category === ALL || c.group === category) && (!q || tr(c.name).includes(q)));
  }, [active, category, query]);

  const show = (type: "error" | "success", text: string) => {
    setNotice({ type, text });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(undefined), 5000);
  };
  const fetchList = async (sourceUrl: string) => {
    const response = await fetch(proxyUrl(sourceUrl));
    if (!response.ok) throw new Error(`Liste alınamadı (${response.status}).`);
    return parseM3U(await response.text(), sourceUrl);
  };
  const addPlaylist = async () => {
    const sourceUrl = url.trim();
    if (!sourceUrl) return show("error", "Önce bir M3U veya M3U8 bağlantısı gir.");
    try { if (!/^https?:$/.test(new URL(sourceUrl).protocol)) throw new Error(); }
    catch { return show("error", "Geçerli bir HTTP veya HTTPS URL gir."); }
    setLoading(true); setNotice(undefined);
    try {
      const list = await fetchList(sourceUrl);
      const item: Playlist = { id: crypto.randomUUID(), name: name.trim() || new URL(sourceUrl).hostname, url: sourceUrl, channels: list, updatedAt: new Date().toISOString() };
      setPlaylists((prev) => [item, ...prev]);
      setActiveId(item.id); setSelected(pickInitialChannel(list)); setCategory(ALL); setQuery("");
      setUrl(""); setName(""); setLibraryOpen(false); setPanelOpen(false);
      show("success", `${list.length} kanal yüklendi.`);
    } catch (error) { show("error", error instanceof Error ? error.message : "Liste yüklenemedi."); }
    finally { setLoading(false); }
  };
  const refresh = async (item: Playlist) => {
    setLoading(true);
    try {
      const list = await fetchList(item.url);
      setPlaylists((prev) => prev.map((p) => p.id === item.id ? { ...p, channels: list, updatedAt: new Date().toISOString() } : p));
      show("success", `${list.length} kanal güncellendi.`);
    } catch (error) { show("error", error instanceof Error ? error.message : "Liste yenilenemedi."); }
    finally { setLoading(false); }
  };
  const remove = (id: string) => {
    const rest = playlists.filter((p) => p.id !== id);
    setPlaylists(rest);
    if (activeId === id) { setActiveId(rest[0]?.id); setSelected(undefined); setCategory(ALL); }
  };
  const openList = (item: Playlist) => {
    setActiveId(item.id); setSelected(pickInitialChannel(item.channels)); setCategory(ALL); setQuery("");
    setLibraryOpen(false); setPanelOpen(true);
  };
  const onPlayerError = useCallback((message: string) => show("error", message), []);

  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touchStart.current = t ? { x: t.clientX, y: t.clientY } : null; wake(); };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current, t = e.changedTouches[0];
    touchStart.current = null;
    if (!s || !t) return;
    const dx = t.clientX - s.x, dy = Math.abs(t.clientY - s.y);
    if (dy > 60) return;
    if (!panelOpen && s.x < 40 && dx > 70) setPanelOpen(true);
    if (panelOpen && dx < -70) setPanelOpen(false);
  };

  return (
    <div className={`app ${awake || panelOpen || libraryOpen ? "" : "asleep"}`}>
      <div className="stage" onPointerMove={wake} onPointerDown={wake} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <main className="screen"><Player channel={selected} onError={onPlayerError} /></main>

        {panelOpen && <button className="scrim" aria-label="Kanal listesini kapat" onClick={() => setPanelOpen(false)} />}
        <aside className={`panel ${panelOpen ? "open" : ""}`} aria-label="Kanal listesi">
          <header className="panel-head">
            <div className="panel-title">
              <h2>{active?.name ?? "Kanallar"}</h2>
              {active && <p>{channels.length === active.channels.length ? `${channels.length} kanal` : `${channels.length} / ${active.channels.length} kanal`}</p>}
            </div>
            <button className="icon-btn" onClick={() => setLibraryOpen(true)} aria-label="Listeleri yönet"><Library size={20} /></button>
            <button className="icon-btn" onClick={() => setPanelOpen(false)} aria-label="Kapat"><X size={22} /></button>
          </header>
          {active ? <>
            <label className="search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kanal ara" type="search" enterKeyHint="search" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Aramayı temizle"><X size={16} /></button>}</label>
            <div className="chips">
              {categories.map((c) => (
                <button key={c} className={category === c ? "on" : ""} onClick={() => setCategory(c)}>
                  {c}<small>{c === ALL ? active.channels.length : counts.get(c)}</small>
                </button>
              ))}
            </div>
            <div className="grid">
              {channels.map((c) => {
                const on = selected?.id === c.id;
                return (
                  <button key={c.id} ref={on ? activeCard : undefined} className={`card ${on ? "on" : ""}`} onClick={() => { setSelected(c); setPanelOpen(false); }} title={c.name}>
                    <Logo channel={c} />
                    <span className="name">{c.name}</span>
                  </button>
                );
              })}
              {!channels.length && <div className="empty-grid"><Search size={22} /><span>“{query || category}” için kanal bulunamadı</span></div>}
            </div>
          </> : (
            <div className="empty-panel"><Tv size={34} /><strong>Henüz liste yok</strong><span>Bir M3U bağlantısı ekleyerek başla.</span><button className="primary" onClick={() => setLibraryOpen(true)}><Plus size={18} />Liste ekle</button></div>
          )}
        </aside>

        <nav className="dock" aria-label="Kontroller">
          <button className={`dock-main ${panelOpen ? "on" : ""}`} onClick={() => setPanelOpen((v) => !v)} aria-label="Kanallar">
            <LayoutGrid size={22} /><span>Kanallar</span>
          </button>
          {selected && <div className="now"><strong>{selected.name}</strong><small>{selected.group || "Canlı"}</small></div>}
          <button className="dock-add" onClick={() => setLibraryOpen(true)} aria-label="Liste ekle"><Plus size={22} /></button>
        </nav>
      </div>

      {notice && <div className={`toast ${notice.type}`} role="status">{notice.type === "success" ? <Check size={18} /> : <AlertCircle size={18} />}<span>{notice.text}</span><button onClick={() => setNotice(undefined)} aria-label="Kapat"><X size={16} /></button></div>}

      {libraryOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setLibraryOpen(false); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Listeleri yönet">
            <header className="modal-head">
              <div><h2>Listelerim</h2><p>Bir liste seç, yenile veya kaldır.</p></div>
              <button className="icon-btn" onClick={() => setLibraryOpen(false)} aria-label="Kapat"><X size={22} /></button>
            </header>
            {playlists.length > 0 && <div className="lists">
              {playlists.map((item) => (
                <div className={`list ${active?.id === item.id ? "on" : ""}`} key={item.id}>
                  <button className="list-main" onClick={() => openList(item)}>
                    <span className="list-icon"><Tv size={20} /></span>
                    <span className="list-copy"><strong>{item.name}</strong><small>{item.url}</small></span>
                    <em>{item.channels.length} kanal</em>
                  </button>
                  <button className="icon-btn sm" title="Yenile" aria-label="Listeyi yenile" onClick={() => refresh(item)} disabled={loading}><RefreshCw size={17} className={loading ? "spin" : ""} /></button>
                  <button className="icon-btn sm danger" title="Sil" aria-label="Listeyi sil" onClick={() => remove(item.id)}><Trash2 size={17} /></button>
                </div>
              ))}
            </div>}
            <div className="add">
              <h3>Yeni liste ekle</h3>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Liste adı (isteğe bağlı)" />
              <div className="url"><Link2 size={17} /><input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPlaylist()} placeholder="https://ornek.com/liste.m3u" inputMode="url" /></div>
              <button className="primary" onClick={addPlaylist} disabled={loading}>{loading ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}Ekle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
