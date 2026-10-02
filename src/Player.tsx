import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Move } from "lucide-react";
import type Hls from "hls.js";
import type { Channel } from "./m3u";
import { proxyUrl } from "./stream";

const isHlsUrl = (url: string) => /(?:\.m3u8?|m3u)(?:$|[?#])/i.test(url);

export function Player({ channel, onError, onMode }: { channel?: Channel; onError: (message: string) => void; onMode?: (mode: "direct" | "proxy") => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fit, setFit] = useState<"contain" | "cover">("contain");

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel) return;
    let hls: Hls | undefined;
    let cancelled = false;
    let usingProxy = false;
    let fallbackStarted = false;
    let retryCount = 0;
    let retryTimer: number | undefined;

    const directUrl = channel.url;
    const fallbackUrl = proxyUrl(channel.url);
    const sourceUrl = () => usingProxy ? fallbackUrl : directUrl;
    const fail = () => {
      if (cancelled) return;
      if (!usingProxy && !fallbackStarted) {
        fallbackStarted = true;
        start(true);
        return;
      }
      retryOrFail("Yayın başlatılamadı. Kaynak kapalı olabilir, CORS engeli veya tarayıcı uyumsuzluğu olabilir.");
    };

    const destroyHls = () => {
      hls?.destroy();
      hls = undefined;
    };
    const retryOrFail = (message: string) => {
      if (cancelled) return;
      if (retryCount < 2) { retryCount += 1; retryTimer = window.setTimeout(() => start(usingProxy), retryCount === 1 ? 2500 : 7000); return; }
      onError(message);
    };

    const start = async (proxy: boolean) => {
      if (cancelled) return;
      usingProxy = proxy;
      onMode?.(proxy ? "proxy" : "direct");
      destroyHls();
      video.pause();
      video.removeAttribute("src");
      video.load();
      const currentUrl = sourceUrl();
      const hintedHls = isHlsUrl(channel.url);

      if (/profile=htsp|^htsp:/i.test(channel.url)) {
        onError("Bu kanal HTSP protokolü kullanıyor; tarayıcı oynatımı için aynı kanalın .m3u8 alternatifini seçin.");
        return;
      }

      if (hintedHls) {
        const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") || video.canPlayType("application/x-mpegURL");
        if (nativeHls) {
          video.src = currentUrl;
          video.load();
          video.play().catch(() => undefined);
          return;
        }
        const { default: HlsPlayer } = await import("hls.js");
        if (cancelled) return;
        if (!HlsPlayer.isSupported()) {
          onError("Bu tarayıcı HLS oynatmayı desteklemiyor.");
          return;
        }
        hls = new HlsPlayer({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30, maxBufferLength: 30 });
        hls.loadSource(currentUrl);
        hls.attachMedia(video);
        hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => { if (!cancelled) video.play().catch(() => undefined); });
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (!data.fatal || cancelled) return;
          if (!usingProxy && !fallbackStarted) {
            fallbackStarted = true;
            start(true);
          } else {
            retryOrFail(`HLS oynatma hatası: ${data.details || "kaynak yanıt vermedi"}.`);
          }
        });
        return;
      }

      video.src = currentUrl;
      video.load();
      video.play().catch(() => undefined);
    };

    video.crossOrigin = "anonymous";
    video.addEventListener("error", fail);
    void start(false);
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      video.removeEventListener("error", fail);
      destroyHls();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [channel, onError, onMode]);

  const toggleFullscreen = () => {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement === shell) {
      void document.exitFullscreen();
      return;
    }
    if (shell.requestFullscreen) void shell.requestFullscreen().catch(() => undefined);
  };
  const toggleFit = () => setFit((value) => value === "contain" ? "cover" : "contain");
  return <div ref={shellRef} className="player-shell"><video ref={videoRef} className={fit === "cover" ? "fill" : ""} controls playsInline poster={channel?.logo} onDoubleClick={toggleFullscreen} /><div className="player-actions"><button className={`player-control ${fit === "cover" ? "active" : ""}`} onClick={toggleFit} title={fit === "cover" ? "Orijinal oran" : "Ekranı doldur"} aria-label={fit === "cover" ? "Orijinal oran" : "Ekranı doldur"} aria-pressed={fit === "cover"}><Move size={18}/><span>{fit === "cover" ? "Orijinal" : "Doldur"}</span></button><button className="player-control" onClick={toggleFullscreen} title={isFullscreen ? "Tam ekrandan çık" : "Tam ekran"} aria-label={isFullscreen ? "Tam ekrandan çık" : "Tam ekran"}>{isFullscreen ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}</button></div>{!channel && <div className="empty-player"><span>▶</span><strong>Bir kanal seç</strong><small>Yayını burada izlemeye başla</small></div>}</div>;
}
