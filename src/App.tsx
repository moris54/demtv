import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, LayoutGrid, Library, Link2, Loader2, Pause, Play, Plus, RefreshCw, Search, Settings2, SkipBack, SkipForward, Tv, X, Youtube } from "lucide-react";
import { parseM3U, type Channel } from "./m3u";
import { Player } from "./Player";
import { proxyUrl } from "./stream";
import { loadPlaylists, loadPrefs, savePlaylists, savePrefs, type UserPrefs } from "./storage";

type Playlist = { id: string; name: string; url: string; channels: Channel[]; updatedAt: string };
const ALL = "Tümü";
const DEFAULT_URL = "https://onureroz.com/indirmeler/turk/index.m3u";

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
  <div className={`card-wrap ${selected ? "on" : ""}`}><button className={`card ${selected ? "on" : ""}`} onClick={() => onSelect(channel)} title={channel.name}>
    <Logo channel={channel} />
    <span className="name">{channel.name}</span>
    <small className="card-group">{channel.group || "Canlı"}</small>
  </button></div>
);

function VirtualChannelGrid({ channels, selected, onSelect }: { channels: Channel[]; selected?: Channel; onSelect: (channel: Channel) => void }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const touchScroll = useRef<{ y: number; top: number } | null>(null);
  const suppressClick = useRef(false);
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
  const gap = compact ? 7 : 10;
  const rowHeight = compact ? 132 : 146;
  const columns = Math.max(1, Math.floor((Math.max(metrics.width - 26, minCard) + gap) / (minCard + gap)));
  const rows = Math.ceil(channels.length / columns);
  const start = Math.max(0, Math.floor(metrics.scrollTop / rowHeight) - 3);
  const end = Math.min(rows, Math.ceil((metrics.scrollTop + metrics.height) / rowHeight) + 3);
  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => { const touch = event.touches[0]; suppressClick.current = false; if (touch && gridRef.current) touchScroll.current = { y: touch.clientY, top: gridRef.current.scrollTop }; };
  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => { const touch = event.touches[0], grid = gridRef.current, start = touchScroll.current; if (!touch || !grid || !start) return; if (Math.abs(touch.clientY - start.y) > 8) suppressClick.current = true; event.preventDefault(); event.stopPropagation(); grid.scrollTop = start.top - (touch.clientY - start.y); };
  const onTouchEnd = () => { touchScroll.current = null; };
  const handleSelect = (channel: Channel) => { if (suppressClick.current) { suppressClick.current = false; return; } onSelect(channel); };
  const onScroll = (event: React.UIEvent<HTMLDivElement>) => { const scrollTop = event.currentTarget.scrollTop; setMetrics((current) => ({ ...current, scrollTop })); };
  return <div className="grid" ref={gridRef} onScroll={onScroll} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
    {!channels.length ? <div className="empty-grid"><Search size={22} /><span>Sonuç bulunamadı</span><small>Arama veya kategori filtresini değiştirin.</small></div> : <div className="virtual-spacer" style={{ height: rows * rowHeight }}>
      {Array.from({ length: end - start }, (_, offset) => {
        const row = start + offset;
        const first = row * columns;
        return <div className="virtual-row" key={row} style={{ top: row * rowHeight, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap }}>
          {channels.slice(first, first + columns).map((channel) => <ChannelCard key={channel.id} channel={channel} selected={selected?.id === channel.id} onSelect={handleSelect} />)}
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
  const [streamMode, setStreamMode] = useState<"direct" | "proxy">();
  const [prefs, setPrefs] = useState<UserPrefs>({ favorites: [], recent: [], hidden: [], carMode: true, sort: "default", theme: "current" });
  const [videoFit, setVideoFit] = useState<"contain" | "cover">("contain");
  const [playerCommand, setPlayerCommand] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [failedChannels, setFailedChannels] = useState<Set<string>>(() => new Set());
  const idleTimer = useRef<number>();
  const noticeTimer = useRef<number>();

  useEffect(() => {
    let alive = true;
    (async () => {
      const [saved, savedPrefs] = await Promise.all([loadPlaylists<Playlist>(), loadPrefs()]);
      if (!alive) return;
      setPrefs(savedPrefs);
      let repaired = saved.map(repairPlaylist);
      if (!repaired.length) {
        try {
          const channels = await fetchList(DEFAULT_URL);
          repaired = [{ id: "default-turk", name: "Türk Kanalları", url: DEFAULT_URL, channels, updatedAt: new Date().toISOString() }];
        } catch { /* varsayılan liste başarısızsa kullanıcı yine manuel ekleyebilir */ }
      }
      setPlaylists(repaired); setActiveId(repaired[0]?.id); setSelected(pickInitialChannel(repaired[0]?.channels || [])); setPanelOpen(true); setHydrated(true);
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (hydrated) void savePlaylists(playlists); }, [hydrated, playlists]);
  useEffect(() => { if (hydrated) void savePrefs(prefs); }, [hydrated, prefs]);
  useEffect(() => { if (!activeId && playlists[0]) setActiveId(playlists[0].id); }, [activeId, playlists]);
  const wake = useCallback(() => { setAwake(true); window.clearTimeout(idleTimer.current); idleTimer.current = window.setTimeout(() => setAwake(false), 4000); }, []);
  useEffect(() => { wake(); return () => window.clearTimeout(idleTimer.current); }, [wake]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setLibraryOpen(false); setPanelOpen(false); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);

  const active = playlists.find((p) => p.id === activeId) || playlists[0];
  const counts = useMemo(() => { const map = new Map<string, number>(); (active?.channels || []).forEach((c) => map.set(c.group || "Diğer", (map.get(c.group || "Diğer") || 0) + 1)); return map; }, [active]);
  const categories = useMemo(() => [ALL, ...Array.from(counts.keys()).sort((a, b) => a.localeCompare(b, "tr"))], [counts]);
  const channels = useMemo(() => {
    const q = tr(query.trim()); const hidden = new Set(prefs.hidden);
    const filtered = (active?.channels || []).filter((c) => !failedChannels.has(c.id) && !hidden.has(c.id) && (category === ALL || c.group === category) && (!q || tr(`${c.name} ${c.group || ""}`).includes(q)));
    if (prefs.sort === "name") return [...filtered].sort((a, b) => a.name.localeCompare(b.name, "tr"));
    if (prefs.sort === "recent") return [...filtered].sort((a, b) => (prefs.recent.indexOf(a.id) - prefs.recent.indexOf(b.id)));
    return filtered;
  }, [active, category, failedChannels, prefs.hidden, prefs.recent, prefs.sort, query]);
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
  const fetchList = async (sourceUrl: string) => {
    let directError: unknown;
    try {
      const directResponse = await fetch(sourceUrl, { mode: "cors" });
      if (directResponse.ok) return parseM3U(await directResponse.text(), sourceUrl);
      directError = new Error(`Doğrudan liste isteği başarısız (${directResponse.status}).`);
    } catch (error) {
      directError = error;
    }

    try {
      const proxyResponse = await fetch(proxyUrl(sourceUrl));
      if (!proxyResponse.ok) throw new Error(`Liste alınamadı (${proxyResponse.status}).`);
      return parseM3U(await proxyResponse.text(), sourceUrl);
    } catch (proxyError) {
      throw proxyError instanceof Error ? proxyError : directError instanceof Error ? directError : new Error("Liste alınamadı.");
    }
  };
  const addPlaylist = async () => {
    const sourceUrl = url.trim();
    if (!sourceUrl) return show("error", "Önce bir M3U veya M3U8 bağlantısı gir.");
    try { if (!/^https?:$/.test(new URL(sourceUrl).protocol)) throw new Error(); } catch { return show("error", "Geçerli bir HTTP veya HTTPS URL gir."); }
    setLoading(true); setNotice(undefined);
    try { const list = await fetchList(sourceUrl); const item: Playlist = { id: crypto.randomUUID(), name: name.trim() || new URL(sourceUrl).hostname, url: sourceUrl, channels: list, updatedAt: new Date().toISOString() }; setPlaylists((prev) => [item, ...prev]); setActiveId(item.id); setSelected(pickInitialChannel(list)); setCategory(ALL); setQuery(""); setUrl(""); setName(""); setLibraryOpen(false); setPanelOpen(true); show("success", `${list.length.toLocaleString("tr-TR")} kanal cihazınıza kaydedildi.`); } catch (error) { show("error", error instanceof Error ? error.message : "Liste yüklenemedi."); } finally { setLoading(false); }
  };
  const refresh = async (item: Playlist) => { setLoading(true); try { const list = await fetchList(item.url); setFailedChannels(new Set()); setPlaylists((prev) => prev.map((p) => p.id === item.id ? { ...p, channels: list, updatedAt: new Date().toISOString() } : p)); show("success", `${list.length.toLocaleString("tr-TR")} kanal güncellendi.`); } catch (error) { show("error", error instanceof Error ? error.message : "Liste yenilenemedi."); } finally { setLoading(false); } };
  const remove = (id: string) => { const rest = playlists.filter((p) => p.id !== id); setPlaylists(rest); if (activeId === id) { setActiveId(rest[0]?.id); setSelected(undefined); setCategory(ALL); } };
  const openList = (item: Playlist) => { setActiveId(item.id); setSelected(pickInitialChannel(item.channels)); setCategory(ALL); setQuery(""); setLibraryOpen(false); setPanelOpen(true); };
  const onPlayerError = useCallback((message: string) => show("error", message), []);
  const onStreamMode = useCallback((mode: "direct" | "proxy") => setStreamMode(mode), []);
  const selectChannel = (channel: Channel) => { setSelected(channel); setPrefs((current) => ({ ...current, recent: [channel.id, ...current.recent.filter((id) => id !== channel.id)].slice(0, 20) })); wake(); };
  const stepChannel = (direction: number) => { if (!channels.length) return; const index = Math.max(0, channels.findIndex((channel) => channel.id === selected?.id)); selectChannel(channels[(index + direction + channels.length) % channels.length]); };
  const markUnavailable = (channel: Channel) => { setFailedChannels((current) => new Set(current).add(channel.id)); setSelected((current) => current?.id === channel.id ? undefined : current); show("error", `${channel.name} kullanılamıyor; listeden gizlendi.`); };
  const openYouTube = () => { window.location.assign("https://www.youtube.com/"); };

  return <div className={`app theme-${prefs.theme} ${prefs.carMode ? "car-mode" : ""} ${awake || panelOpen || libraryOpen ? "" : "asleep"}`}>
    <div className="stage" onPointerMove={wake} onPointerDown={wake}>
      <main className="screen"><Player channel={selected} onError={onPlayerError} onMode={onStreamMode} fit={videoFit} command={playerCommand} onPlayingChange={setPlaying} onUnavailable={markUnavailable} /></main>
      <button className="youtube-shortcut" onClick={openYouTube} aria-label="YouTube'u aç" title="YouTube"><Youtube size={19} /><span>YouTube</span></button>
      <button className={`fill-toggle ${videoFit === "cover" ? "on" : ""}`} onClick={() => setVideoFit((value) => value === "contain" ? "cover" : "contain")} aria-label={videoFit === "cover" ? "Orijinal görüntü" : "Ekranı doldur"}>{videoFit === "cover" ? "Orijinal" : "Ekranı doldur"}</button>
      {panelOpen && <button className="scrim" aria-label="Kanal listesini kapat" onClick={() => setPanelOpen(false)} />}
      <aside className={`panel ${panelOpen ? "open" : ""}`} aria-label="Kanal listesi">
        <header className="panel-head"><div className="panel-title"><h2>{active?.name ?? "Kanallar"}</h2><p>{active ? `${channels.length.toLocaleString("tr-TR")} kanal hazır` : "Kişisel yayın kütüphanen"}</p></div><span className={`status-pill ${streamMode === "proxy" ? "proxy" : ""}`}><i /> {streamMode === "proxy" ? "Proxy yedek" : streamMode === "direct" ? "Doğrudan" : "Cihazda"}</span><button className="icon-btn" onClick={() => setLibraryOpen(true)} aria-label="Listeleri yönet"><Library size={20} /></button><button className="icon-btn" onClick={() => setPanelOpen(false)} aria-label="Kapat"><X size={22} /></button></header>
        {!hydrated ? <div className="loading-panel"><Loader2 className="spin" size={24} /><span>Kütüphanen hazırlanıyor…</span></div> : active ? <><label className="search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Kanal ara · dokun ve oynat" type="search" enterKeyHint="search" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Aramayı temizle"><X size={16} /></button>}</label><div className="chips">{categories.map((c) => <button key={c} className={category === c ? "on" : ""} onClick={() => setCategory(c)}>{c}<small>{c === ALL ? active.channels.length.toLocaleString("tr-TR") : counts.get(c)?.toLocaleString("tr-TR")}</small></button>)}</div><VirtualChannelGrid channels={channels} selected={selected} onSelect={selectChannel} /></> : <div className="empty-panel"><Tv size={34} /><strong>Yayın kütüphanen boş</strong><span>Bir M3U bağlantısı ekle; liste cihazında saklansın.</span><button className="primary" onClick={() => setLibraryOpen(true)}><Plus size={18} />Liste ekle</button></div>}
      </aside>
      <nav className="dock" aria-label="Kanal kontrolleri"><button className="dock-channel" onClick={() => setPanelOpen((value) => !value)} aria-label="Kanal listesini aç veya kapat"><LayoutGrid size={22} /><span>Kanal</span></button><button className="dock-skip" onClick={() => stepChannel(-1)} aria-label="Önceki kanal"><SkipBack size={23} /></button><button className="dock-play" onClick={() => setPlayerCommand((value) => value + 1)} aria-label={playing ? "Durdur" : "Oynat"}>{playing ? <Pause size={26} /> : <Play size={26} fill="currentColor" />}</button><button className="dock-skip" onClick={() => stepChannel(1)} aria-label="Sonraki kanal"><SkipForward size={23} /></button>{selected && <div className="now"><strong>{selected.name}</strong><small>{selected.group || "Canlı"}</small></div>}<button className="dock-settings" onClick={() => setSettingsOpen((value) => !value)} aria-label="Ayarlar"><Settings2 size={21} /><span>Ayarlar</span></button></nav>
      {settingsOpen && <section className="settings-card" aria-label="Ayarlar"><div className="settings-head"><div><strong>Ayarlar</strong><small>Dokunmatik kullanım tercihleri</small></div><button className="settings-close" onClick={() => setSettingsOpen(false)} aria-label="Ayarları kapat"><X size={18} /></button></div><div className="setting-label">Arayüz tasarımı</div><div className="theme-options"><button className={`theme-choice preview-current ${prefs.theme === "current" ? "selected" : ""}`} onClick={() => setPrefs((current) => ({ ...current, theme: "current" }))}><i />Mevcut</button><button className={`theme-choice preview-midnight ${prefs.theme === "midnight" ? "selected" : ""}`} onClick={() => setPrefs((current) => ({ ...current, theme: "midnight" }))}><i />Midnight</button><button className={`theme-choice preview-glass ${prefs.theme === "glass" ? "selected" : ""}`} onClick={() => setPrefs((current) => ({ ...current, theme: "glass" }))}><i />Glass</button><button className={`theme-choice preview-ember ${prefs.theme === "ember" ? "selected" : ""}`} onClick={() => setPrefs((current) => ({ ...current, theme: "ember" }))}><i />Ember</button></div><button className="setting-row" onClick={() => setPrefs((current) => ({ ...current, carMode: !current.carMode }))}><span><Settings2 size={18} /><b>Araç modu</b><small>Büyük dokunma alanları ve sabit kanal paneli</small></span><i className={prefs.carMode ? "switch on" : "switch"}>{prefs.carMode ? "Açık" : "Kapalı"}</i></button><div className="setting-label">Kanal sıralaması</div><div className="setting-options"><button className={prefs.sort === "default" ? "selected" : ""} onClick={() => setPrefs((current) => ({ ...current, sort: "default" }))}>Liste sırası</button><button className={prefs.sort === "name" ? "selected" : ""} onClick={() => setPrefs((current) => ({ ...current, sort: "name" }))}>A–Z</button><button className={prefs.sort === "recent" ? "selected" : ""} onClick={() => setPrefs((current) => ({ ...current, sort: "recent" }))}>Son kullanılan</button></div><div className="setting-label">Video görünümü</div><div className="setting-options"><button className={videoFit === "contain" ? "selected" : ""} onClick={() => setVideoFit("contain")}>Orijinal</button><button className={videoFit === "cover" ? "selected" : ""} onClick={() => setVideoFit("cover")}>Ekranı doldur</button></div></section>}
    </div>
    {notice && <div className={`toast ${notice.type}`} role="status">{notice.type === "success" ? <Check size={18} /> : <AlertCircle size={18} />}<span>{notice.text}</span><button onClick={() => setNotice(undefined)} aria-label="Kapat"><X size={16} /></button></div>}
    {libraryOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLibraryOpen(false); }}><div className="modal" role="dialog" aria-modal="true" aria-label="Listeleri yönet"><header className="modal-head"><div><div className="eyebrow">KÜTÜPHANE</div><h2>Listelerim</h2><p>Listeler ve kanallar yalnızca bu cihazda saklanır.</p></div><button className="icon-btn" onClick={() => setLibraryOpen(false)} aria-label="Kapat"><X size={22} /></button></header>{playlists.length > 0 && <div className="lists">{playlists.map((item) => <div className={`list ${active?.id === item.id ? "on" : ""}`} key={item.id}><button className="list-main" onClick={() => openList(item)}><span className="list-icon"><Tv size={20} /></span><span className="list-copy"><strong>{item.name}</strong><small>{item.url}</small></span><em>{item.channels.length.toLocaleString("tr-TR")} kanal</em></button><button className="icon-btn sm" title="Yenile" aria-label="Listeyi yenile" onClick={() => refresh(item)} disabled={loading}><RefreshCw size={17} className={loading ? "spin" : ""} /></button><button className="icon-btn sm danger" title="Sil" aria-label="Listeyi sil" onClick={() => remove(item.id)}><X size={17} /></button></div>)}</div>}<div className="add"><h3>Yeni liste ekle</h3><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Liste adı (isteğe bağlı)" /><div className="url"><Link2 size={17} /><input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addPlaylist()} placeholder="https://ornek.com/liste.m3u" inputMode="url" /></div><button className="primary" onClick={addPlaylist} disabled={loading}>{loading ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}Ekle</button><small className="device-note">Büyük listeler cihazındaki IndexedDB alanında tutulur; Render yalnızca listeyi almak için kullanılır.</small></div></div></div>}
  </div>;
}
export default App;
