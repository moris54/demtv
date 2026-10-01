import { useEffect, useRef } from "react";
import { Maximize2 } from "lucide-react";
import type Hls from "hls.js";
import type { Channel } from "./m3u";
import { proxyUrl } from "./stream";

const isHlsUrl = (url: string) => /(?:\.m3u8?|m3u)(?:$|[?#])/i.test(url);

export function Player({ channel, onError }: { channel?: Channel; onError: (message: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel) return;
    let hls: Hls | undefined;
    let cancelled = false;
    let usingProxy = false;
    let fallbackStarted = false;

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
      onError("Yayın başlatılamadı. Kaynak kapalı olabilir, CORS engeli veya tarayıcı uyumsuzluğu olabilir.");
    };

    const destroyHls = () => {
      hls?.destroy();
      hls = undefined;
    };

    const start = async (proxy: boolean) => {
      if (cancelled) return;
      usingProxy = proxy;
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
            onError(`HLS oynatma hatası: ${data.details || "kaynak yanıt vermedi"}.`);
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
      video.removeEventListener("error", fail);
      destroyHls();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [channel, onError]);

  const toggleFullscreen = () => { if (shellRef.current?.requestFullscreen) void shellRef.current.requestFullscreen(); };
  return <div ref={shellRef} className="player-shell"><video ref={videoRef} controls playsInline poster={channel?.logo} onDoubleClick={toggleFullscreen} /><button className="player-fullscreen-button" onClick={toggleFullscreen} title="Tam ekran" aria-label="Tam ekran"><Maximize2 size={18}/></button>{!channel && <div className="empty-player"><span>▶</span><strong>Bir kanal seç</strong><small>Yayını burada izlemeye başla</small></div>}</div>;
}
