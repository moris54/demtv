import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, LayoutGrid, Library, Link2, Loader2, Plus, RefreshCw, Search, Tv, X } from "lucide-react";
import { parseM3U, type Channel } from "./m3u";
import { Player } from "./Player";
import { proxyUrl } from "./stream";
import { loadPlaylists, savePlaylists } from "./storage";

type Playlist = { id: string; name: string; url: string; channels: Channel[]; updatedAt: string };
const ALL = "Tümü";

const repairChannelUrl = (channel: Channel): Channel => {
  try {
    const original = new URL(channel.url, window.location.origin).searchParams.get("url");
    return original ? { ...channel, url: original } : channel;
  } catch { return channel; }
};
const repairPlaylist = (playlist: Playlist): Playlist => ({ ...playlist, channels: Array.isArray(playlist.channels) ? playlist.channels.map(repairChannelUrl) : [] });
const pickInitialChannel = (channels: Channel[]) => channels.find((c) => /(?:\.m3u8?|m3u)(?:$|[?#])/i.test(c.url)) || channels[0];
const tr = (s: string) => s.toLocaleLowerCase("tr");

function Logo({ channel }: { channel: Channel }) {
  const [failed, setFailed] = useState(false);
  const initials = channel.name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <span className="logo">{channel.logo && !failed ? <img src={channel.logo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initials ? <b>{initials}</b> : <Tv size={26} />}</span>;
}

const ChannelCard = ({ channel, selected, onSelect }: { channel: Channel; selected: boolean; onSelect: (channel: Channel) => void }) => (
  <button className={`card ${selected ? "on" : ""}`} onClick={() => onSelect(channel)} title={channel.name}>
    <Logo channel={channel} />
    <span className="name">{channel.name}</span>
    <small className="card-group">{channel.group || "Canlı"}</small>
  </button>
);

function VirtualChannelGrid({ channels, selected, onSelect }: { channels: Channel[]; selected?: Channel; onSelect: (channel: Channel) => void }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const touchScroll = useRef<{ y: number; top: number } | null>(null);
  const [metrics, setMetrics] = useState({ width: 0, height: 0, scrollTop: 0 });
  useLayoutEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    const update = () => setMetrics((current) => ({ ...current, width: element.clientWidth, height: element.clientHeight }));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const compact = metrics.width > 0 && metrics.width < 560;
  const minCard = compact ? 96 : 112;
  const gap = compact ? 8 : 10;
  const rowHeight = compact ? 146 : 154;
  const columns = Math.max(1, Math.floor((Math.max(metrics.width - 26, minCard) + gap) / (minCard + gap)));
  const rows = Math.ceil(channels.length / columns);
  const start = Math.max(0, Math.floor(metrics.scrollTop / rowHeight) - 3);
  const end = Math.min(rows, Math.ceil((metrics.scrollTop + metrics.height) / rowHeight) + 3);
  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => { const touch = event.touches[0]; if (touch && gridRef.current) touchScroll.current = { y: touch.clientY, top: gridRef.current.scrollTop }; };
  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => { const touch = event.touches[0], grid = gridRef.current, start = touchScroll.current; if (!touch || !grid || !start) return; event.preventDefault(); event.stopPropagation(); grid.scrollTop = start.top - (touch.clientY - start.y); };
  const onTouchEnd = () => { touchScroll.current = null; };
  return <div className="grid" ref={gridRef} onScroll={(event) => setMetrics((current) => ({ ...current, scrollTop: event.currentTarget.scrollTop }))} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
    {!channels.length ? <div className="empty-grid"><Search size={22} /><span>Sonuç bulunamadı</span><small>Arama veya kategori filtresini değiştirin.</small></div> : <div className="virtual-spacer" style={{ height: rows * rowHeight }}>
      {Array.from({ length: end - start }, (_, offset) => {
        const row = start + offset;
        const first = row * columns;
        return <div className="virtual-row" key={row} style={{ top: row * rowHeight, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap }}>
          {channels.slice(first, first + columns).map((channel) => <ChannelCard key={channel.id} channel={channel} selected={selected?.id === channel.id} onSelect={onSelect} />)}
        </div>;
      })}
    </div>}
  </div>;
}

function App() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [selected, setSelected] = useState<Channel>();
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string }>();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [awake, setAwake] = useState(true);
  const idleTimer = useRef<number>();
  const noticeTimer = useRef<number>();

  useEffect(() => {
    let alive = true;
    loadPlaylists<Playlist>().then((saved) => { if (!alive) return; const repaired = saved.map(repairPlaylist); setPlaylists(repaired); setActiveId(repaired[0]?.id); setSelected(pickInitialChannel(repaired[0]?.channels || [])); setPanelOpen(true); setHydrated(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (hydrated) void savePlaylists(playlists); }, [hydrated, playlists]);
  useEffect(() => { if (!activeId && playlists[0]) setActiveId(playlists[0].id); }, [activeId, playlists]);
  const wake = useCallback(() => { setAwake(true); window.clearTimeout(idleTimer.current); idleTimer.current = window.setTimeout(() => setAwake(false), 4000); }, []);
  useEffect(() => { wake(); return () => window.clearTimeout(idleTimer.current); }, [wake]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setLibraryOpen(false); setPanelOpen(false); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);

  const active = playlists.find((p) => p.id === activeId) || playlists[0];
  const counts = useMemo(() => { const map = new Map<string, number>(); (active?.channels || []).forEach((c) => map.set(c.group || "Diğer", (map.get(c.group || "Diğer") || 0) + 1)); return map; }, [active]);
  const categories = useMemo(() => [ALL, ...Array.from(counts.keys()).sort((a, b) => a.localeCompare(b, "tr"))], [counts]);
  const channels = useMemo(() => { const q = tr(query.trim()); return (active?.channels || []).filter((c) => (category === ALL || c.group === category) && (!q || tr(c.name).includes(q))); }, [active, category, query]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (libraryOpen || !channels.length || !["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) return;
      event.preventDefault();
      const current = Math.max(0, channels.findIndex((channel) => channel.id === selected?.id));
      const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      setSelected(channels[(current + direction + channels.length) % channels.length]);
      wake();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [channels, libraryOpen, selected, wake]);
  const show = (type: "error" | "success", text: string) => { setNotice({ type, text }); window.clearTimeout(noticeTimer.current); noticeTimer.current = window.setTimeout(() => setNotice(undefined), 5000); };
  const fetchList = async (sourceUrl: string) => { const response = await fetch(proxyUrl(sourceUrl)); if (!response.ok) throw new Error(`Liste alınamadı (${response.status}).`); return parseM3U(await response.text(), sourceUrl); };
  const addPlaylist = async () => {
    const sourceUrl = url.trim();
    if (!sourceUrl) return show("error", "Önce bir M3U veya M3U8 bağlantısı gir.");
    try { if (!/^https?:$/.test(new URL(sourceUrl).protocol)) throw new Error(); } catch { return show("error", "Geçerli bir HTTP veya HTTPS URL gir."); }
    setLoading(true); setNotice(undefined);
    try { const list = await fetchList(sourceUrl); const item: Playlist = { id: crypto.randomUUID(), name: name.trim() || new URL(sourceUrl).hostname, url: sourceUrl, channels: list, updatedAt: new Date().toISOString() }; setPlaylists((prev) => [item, ...prev]); setActiveId(item.id); setSelected(pickInitialChannel(list)); setCategory(ALL); setQuery(""); setUrl(""); setName(""); setLibraryOpen(false); setPanelOpen(true); show("success", `${list.length.toLocaleString("tr-TR")} kanal cihazınıza kaydedildi.`); } catch (error) { show("error", error instanceof Error ? error.message : "Liste yüklenemedi."); } finally { setLoading(false); }
  };
  const refresh = async (item: Playlist) => { setLoading(true); try { const list = await fetchList(item.url); setPlaylists((prev) => prev.map((p) => p.id === item.id ? { ...p, channels: list, updatedAt: new Date().toISOString() } : p)); show("success", `${list.length.toLocaleString("tr-TR")} kanal güncellendi.`); } catch (error) { show("error", error instanceof Error ? error.message : "Liste yenilenemedi."); } finally { setLoading(false); } };
  const remove = (id: string) => { const rest = playlists.filter((p) => p.id !== id); setPlaylists(rest); if (activeId === id) { setActiveId(rest[0]?.id); setSelected(undefined); setCategory(ALL); } };
  const openList = (item: Playlist) => { setActiveId(item.id); setSelected(pickInitialChannel(item.channels)); setCategory(ALL); setQuery(""); setLibraryOpen(false); setPanelOpen(true); };
  const onPlayerError = useCallback((message: string) => show("error", message), []);

  return <div className={`app ${awake || panelOpen || libraryOpen ? "" : "asleep"}`}>
    <div className="stage" onPointerMove={wake} onPointerDown={wake}>
      <main className="screen"><Player channel={selected} onError={onPlayerError} /></main>
      {panelOpen && <button className="scrim" aria-label="Kanal listesini kapat" onClick={() => setPanelOpen(false)} />}
      <aside className={`panel ${panelOpen ? "open" : ""}`} aria-label="Kanal listesi">
        <header className="panel-head"><div className="panel-title"><div className="eyebrow">M3U STREAM PLAYER</div><h2>{active?.name ?? "Kanallar"}</h2><p>{active ? `${channels.length.toLocaleString("tr-TR")} / ${active.channels.length.toLocaleString("tr-TR")} kanal` : "Kişisel yayın kütüphanen"}</p></div><span className="status-pill"><i /> Cihazda</span><button className="icon-btn" onClick={() => setLibraryOpen(true)} aria-label="Listeleri yönet"><Library size={20} /></button><button className="icon-btn" onClick={() => setPanelOpen(false)} aria-label="Kapat"><X size={22} /></button></header>
        {!hydrated ? <div className="loading-panel"><Loader2 className="spin" size={24} /><span>Kütüphanen hazırlanıyor…</span></div> : active ? <><label className="search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Binlerce kanal içinde ara" type="search" enterKeyHint="search" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Aramayı temizle"><X size={16} /></button>}</label><div className="chips">{categories.map((c) => <button key={c} className={category === c ? "on" : ""} onClick={() => setCategory(c)}>{c}<small>{c === ALL ? active.channels.length.toLocaleString("tr-TR") : counts.get(c)?.toLocaleString("tr-TR")}</small></button>)}</div><VirtualChannelGrid channels={channels} selected={selected} onSelect={(channel) => { setSelected(channel); wake(); if (window.innerWidth <= 560) setPanelOpen(false); }} /></> : <div className="empty-panel"><Tv size={34} /><strong>Yayın kütüphanen boş</strong><span>Bir M3U bağlantısı ekle; liste cihazında saklansın.</span><button className="primary" onClick={() => setLibraryOpen(true)}><Plus size={18} />Liste ekle</button></div>}
      </aside>
      <nav className="dock" aria-label="Kontroller"><button className={`dock-main ${panelOpen ? "on" : ""}`} onClick={() => setPanelOpen((value) => !value)} aria-label="Kanallar"><LayoutGrid size={22} /><span>Kanallar</span></button>{selected && <div className="now"><strong>{selected.name}</strong><small>{selected.group || "Canlı"}</small></div>}<button className="dock-add" onClick={() => setLibraryOpen(true)} aria-label="Liste ekle"><Plus size={22} /></button></nav>
    </div>
    {notice && <div className={`toast ${notice.type}`} role="status">{notice.type === "success" ? <Check size={18} /> : <AlertCircle size={18} />}<span>{notice.text}</span><button onClick={() => setNotice(undefined)} aria-label="Kapat"><X size={16} /></button></div>}
    {libraryOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLibraryOpen(false); }}><div className="modal" role="dialog" aria-modal="true" aria-label="Listeleri yönet"><header className="modal-head"><div><div className="eyebrow">KÜTÜPHANE</div><h2>Listelerim</h2><p>Listeler ve kanallar yalnızca bu cihazda saklanır.</p></div><button className="icon-btn" onClick={() => setLibraryOpen(false)} aria-label="Kapat"><X size={22} /></button></header>{playlists.length > 0 && <div className="lists">{playlists.map((item) => <div className={`list ${active?.id === item.id ? "on" : ""}`} key={item.id}><button className="list-main" onClick={() => openList(item)}><span className="list-icon"><Tv size={20} /></span><span className="list-copy"><strong>{item.name}</strong><small>{item.url}</small></span><em>{item.channels.length.toLocaleString("tr-TR")} kanal</em></button><button className="icon-btn sm" title="Yenile" aria-label="Listeyi yenile" onClick={() => refresh(item)} disabled={loading}><RefreshCw size={17} className={loading ? "spin" : ""} /></button><button className="icon-btn sm danger" title="Sil" aria-label="Listeyi sil" onClick={() => remove(item.id)}><X size={17} /></button></div>)}</div>}<div className="add"><h3>Yeni liste ekle</h3><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Liste adı (isteğe bağlı)" /><div className="url"><Link2 size={17} /><input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addPlaylist()} placeholder="https://ornek.com/liste.m3u" inputMode="url" /></div><button className="primary" onClick={addPlaylist} disabled={loading}>{loading ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}Ekle</button><small className="device-note">Büyük listeler cihazındaki IndexedDB alanında tutulur; Render yalnızca listeyi almak için kullanılır.</small></div></div></div>}
  </div>;
}
export default App;
