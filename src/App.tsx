import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ExternalLink, Loader2, Menu, Plus, Tv, Wifi, X } from "lucide-react";
import { parseM3U, type Channel } from "./m3u";
import { Player } from "./Player";
import { proxyUrl } from "./stream";

type Playlist = { id: string; name: string; url: string; channels: Channel[]; updatedAt: string };
const STORE = "m3u-stream-playlists";
const repairChannelUrl = (channel: Channel): Channel => { try { const parsed = new URL(channel.url, window.location.origin); const original = parsed.searchParams.get("url"); return original ? { ...channel, url: original } : channel; } catch { return channel; } };
const readSaved = (): Playlist[] => { try { const value = JSON.parse(localStorage.getItem(STORE) || "[]"); return Array.isArray(value) ? value.map((playlist) => ({ ...playlist, channels: Array.isArray(playlist.channels) ? playlist.channels.map(repairChannelUrl) : [] })) : []; } catch { return []; } };
const pickInitialChannel = (channels: Channel[]) => channels.find((channel) => /(?:\.m3u8?|m3u)(?:$|[?#])/i.test(channel.url)) || channels[0];

function App() {
  const [playlists, setPlaylists] = useState<Playlist[]>(readSaved);
  const [url, setUrl] = useState(""); const [name, setName] = useState("");
  const [activeId, setActiveId] = useState<string>(); const [selected, setSelected] = useState<Channel>(); const [category, setCategory] = useState("Tümü");
  const [loading, setLoading] = useState(false); const [notice, setNotice] = useState<{type:"error"|"success"; text:string}>(); const [addOpen, setAddOpen] = useState(false); const [sidebarOpen, setSidebarOpen] = useState(false);
  const touchStartY = useRef<number | null>(null);
  useEffect(() => localStorage.setItem(STORE, JSON.stringify(playlists)), [playlists]);
  useEffect(() => { if (!activeId && playlists[0]) setActiveId(playlists[0].id); }, [activeId, playlists]);
  useEffect(() => { if (!playlists.length) setSidebarOpen(true); }, [playlists.length]);
  const active = playlists.find((item) => item.id === activeId) || playlists[0];
  const categories = useMemo(() => ["Tümü", ...Array.from(new Set((active?.channels || []).map((c) => c.group || "Diğer"))).sort()], [active]);
  const channels = useMemo(() => (active?.channels || []).filter((c) => category === "Tümü" || c.group === category), [active, category]);
  const show = (type: "error"|"success", text: string) => { setNotice({ type, text }); window.setTimeout(() => setNotice(undefined), 5000); };
  const addPlaylist = async () => {
    if (!url.trim()) return show("error", "Önce bir M3U veya M3U8 bağlantısı gir.");
    try { const parsed = new URL(url); if (!/^https?:$/.test(parsed.protocol)) throw new Error(); } catch { return show("error", "Geçerli bir HTTP veya HTTPS URL gir."); }
    setLoading(true); setNotice(undefined);
    try { const sourceUrl = url.trim(); const response = await fetch(proxyUrl(sourceUrl)); if (!response.ok) throw new Error(`Liste alınamadı (${response.status}).`); const channels = parseM3U(await response.text(), sourceUrl); const item = { id: crypto.randomUUID(), name: name.trim() || new URL(sourceUrl).hostname, url: sourceUrl, channels, updatedAt: new Date().toISOString() }; setPlaylists((prev) => [item, ...prev]); setActiveId(item.id); setSelected(pickInitialChannel(channels)); setUrl(""); setName(""); setAddOpen(false); setSidebarOpen(false); show("success", `${channels.length} kanal yüklendi.`); } catch (error) { show("error", error instanceof Error ? error.message : "Liste yüklenemedi."); } finally { setLoading(false); }
  };
  const refresh = async (item: Playlist) => { setLoading(true); try { const res = await fetch(proxyUrl(item.url)); if (!res.ok) throw new Error("Liste yenilenemedi."); const channels = parseM3U(await res.text(), item.url); setPlaylists((prev) => prev.map((p) => p.id === item.id ? { ...p, channels, updatedAt: new Date().toISOString() } : p)); show("success", `${channels.length} kanal güncellendi.`); } catch (error) { show("error", error instanceof Error ? error.message : "Liste yenilenemedi."); } finally { setLoading(false); } };
  const remove = (id: string) => { setPlaylists((prev) => prev.filter((p) => p.id !== id)); if (activeId === id) { setActiveId(undefined); setSelected(undefined); } };
  const onPlayerError = useCallback((message: string) => show("error", message), []);
  const selectChannel = (channel: Channel) => { setSelected(channel); };
  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => { touchStartY.current = event.touches[0]?.clientY ?? null; };
  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => { const start = touchStartY.current; const end = event.changedTouches[0]?.clientY; touchStartY.current = null; if (start === null || end === undefined) return; const distance = end - start; if (!sidebarOpen && start < 80 && distance > 70) setSidebarOpen(true); if (sidebarOpen && distance < -70) setSidebarOpen(false); };

  return <div className="car-app">
    <div className="car-stage" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <aside className={`channel-drawer ${sidebarOpen ? "open" : ""}`}>
        <div className="drawer-head"><div className="drawer-title"><span className="drawer-grabber"/></div><button onClick={() => setSidebarOpen(false)} aria-label="Kapat"><X size={22}/></button></div>
        {playlists.length > 0 && <><div className="category-strip">{categories.map((item) => <button className={category === item ? "active" : ""} key={item} onClick={() => setCategory(item)}>{item === "Tümü" ? "Tümü" : item}</button>)}</div><div className="drawer-channels logo-grid">{channels.map((channel) => <button className={`drawer-channel logo-channel ${selected?.id === channel.id ? "active" : ""}`} key={channel.id} onClick={() => selectChannel(channel)}><span className="drawer-logo">{channel.logo ? <img src={channel.logo} onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <Tv size={28}/>}</span><span className="drawer-info"><strong>{channel.name}</strong></span></button>)}{!channels.length && <div className="drawer-empty">Kanal bulunamadı</div>}</div></>}
        {!playlists.length && <div className="drawer-empty"><Tv size={30}/><span>Liste eklemek için yandaki + tuşuna dokun</span></div>}
      </aside>
      <main className="car-player"><Player channel={selected} onError={onPlayerError}/></main>
      <div className="floating-controls"><button className={`floating-button menu-float ${sidebarOpen ? "active" : ""}`} onClick={() => setSidebarOpen((value) => !value)} aria-label="Kanal menüsü"><Menu size={25}/></button><button className="floating-button add-float" onClick={() => setAddOpen(true)} aria-label="Liste ekle"><Plus size={25}/></button></div>
    </div>
    {notice && <div className={`car-notice ${notice.type}`}><span>{notice.type === "success" ? <Check size={16}/> : <AlertCircle size={16}/>}</span>{notice.text}<button onClick={() => setNotice(undefined)}><X size={15}/></button></div>}
    {addOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddOpen(false); }}><div className="add-modal link-manager"><div className="modal-head"><div><span className="drawer-kicker">YAYIN KÜTÜPHANESİ</span><h2>Bağlantıları yönet</h2><p className="manager-subtitle">Listelerini buradan seç, yenile veya kaldır.</p></div><button className="modal-close" onClick={() => setAddOpen(false)} aria-label="Kapat"><X size={18}/></button></div>{playlists.length > 0 && <div className="saved-links">{playlists.map((item) => <div className={`saved-link ${active?.id === item.id ? "active" : ""}`} key={item.id}><button className="saved-link-main" onClick={() => { setActiveId(item.id); setSelected(pickInitialChannel(item.channels)); setCategory("Tümü"); setAddOpen(false); }}><span className="saved-link-icon"><Tv size={18}/></span><span className="saved-link-copy"><strong>{item.name}</strong><small>{item.url}</small><em>{item.channels.length} kanal</em></span></button><div className="saved-link-actions"><button title="Listeyi yenile" onClick={() => refresh(item)} disabled={loading}><span className={loading ? "spin" : ""}>↻</span></button><button title="Listeyi sil" onClick={() => remove(item.id)}>×</button></div></div>)}</div>}<div className="manager-add"><div className="manager-add-title"><Plus size={17}/><strong>Yeni bağlantı ekle</strong></div><div className="manager-form"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Liste adı (isteğe bağlı)"/><div className="url-input"><ExternalLink size={16}/><input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPlaylist()} placeholder="https://ornek.com/playlist.m3u"/></div><button className="primary" onClick={addPlaylist} disabled={loading}>{loading ? <Loader2 className="spin" size={17}/> : <Plus size={17}/>} Ekle</button></div><p className="helper"><Wifi size={13}/> Herkese açık M3U/M3U8 bağlantısı.</p></div></div></div>}
  </div>;
}
export default App;
