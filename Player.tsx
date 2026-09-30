import { useEffect, useRef } from "react";
import { Maximize2 } from "lucide-react";
import type Hls from "hls.js";
import type { Channel } from "./m3u";
import { proxyUrl } from "./stream";

const isPlaylistType = (contentType: string) => /mpegurl|x-mpegurl/i.test(contentType);

export function Player({ channel, onError }: { channel?: Channel; onError: (message: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel) return;
    let hls: Hls | undefined;
    let cancelled = false;
    const fail = () => onError("Yayın başlatılamadı. Kaynak kapalı olabilir, DRM kullanıyor olabilir veya yayın biçimi tarayıcıyla uyumlu olmayabilir.");
    const setup = async () => {
      const sourceUrl = proxyUrl(channel.url);
      if (/profile=htsp|^htsp:/i.test(channel.url)) { onError("Bu kanal HTSP protokolü kullanıyor; tarayıcı oynatımı için aynı kanalın .m3u8 alternatifini seçin."); return; }
      const hintedHls = /(?:\.m3u8?|m3u)(?:$|[?#])/i.test(channel.url);
      let isHls = hintedHls;
      let contentType = "";
      if (!hintedHls) {
        try {
          const probe = await fetch(`${sourceUrl}&probe=1`);
          contentType = probe.headers.get("content-type") || "";
          if (isPlaylistType(contentType)) isHls = true;
          if (/text\/html/i.test(contentType)) { onError("Bu kanal yayın yerine bir web sayfası döndürdü. Doğrudan yayın URL'sini kullanın."); return; }
          if (/mpeg|octet-stream/i.test(contentType) && !/video\/(mp4|webm)/i.test(contentType)) { onError("Bu kanal doğrudan MPEG-TS/özel akış döndürüyor; tarayıcı bunu HLS playlist olmadan oynatamıyor."); return; }
        } catch { /* Bazı kaynaklar probe isteklerini engeller; oynatmayı yine de dene. */ }
      }
      if (cancelled) return;
      if (isHls) {
        const { default: HlsPlayer } = await import("hls.js");
        if (cancelled) return;
        if (!HlsPlayer.isSupported()) { onError("Bu tarayıcı HLS oynatmayı desteklemiyor."); return; }
        hls = new HlsPlayer({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
        hls.loadSource(sourceUrl); hls.attachMedia(video);
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => { if (data.fatal) window.setTimeout(() => { if (video.readyState < 2 && video.currentTime === 0) onError(`HLS oynatma hatası: ${data.details || "kaynak yanıt vermedi"}.`); }, 1200); });
      } else {
        video.src = sourceUrl;
      }
      video.play().catch(() => undefined);
    };
    video.addEventListener("error", fail);
    void setup();
    return () => { cancelled = true; video.removeEventListener("error", fail); hls?.destroy(); video.pause(); video.removeAttribute("src"); video.load(); };
  }, [channel, onError]);
  const toggleFullscreen = () => { if (shellRef.current?.requestFullscreen) void shellRef.current.requestFullscreen(); };
  return <div ref={shellRef} className="player-shell"><video ref={videoRef} controls playsInline poster={channel?.logo} onDoubleClick={toggleFullscreen} /><button className="player-fullscreen-button" onClick={toggleFullscreen} title="Tam ekran" aria-label="Tam ekran"><Maximize2 size={18}/></button>{!channel && <div className="empty-player"><span>▶</span><strong>Bir kanal seç</strong><small>Yayını burada izlemeye başla</small></div>}</div>;
}
