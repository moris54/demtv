import { useEffect, useRef } from "react";
import type Hls from "hls.js";
import type { Channel } from "./m3u";
import { proxyUrl } from "./stream";

const isHlsUrl = (url: string) => /(?:\.m3u8?|m3u)(?:$|[?#])/i.test(url);

export function Player({ channel, onError, onMode, fit, command, onPlayingChange, onUnavailable }: { channel?: Channel; onError: (message: string) => void; onMode?: (mode: "direct" | "proxy") => void; fit: "contain" | "cover"; command: number; onPlayingChange?: (playing: boolean) => void; onUnavailable?: (channel: Channel) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const video = videoRef.current; if (!video) return; const sync = () => onPlayingChange?.(!video.paused); video.addEventListener("play", sync); video.addEventListener("pause", sync); return () => { video.removeEventListener("play", sync); video.removeEventListener("pause", sync); }; }, [onPlayingChange]);
  useEffect(() => { const video = videoRef.current; if (!video || !command) return; if (video.paused) video.play().catch(() => undefined); else video.pause(); }, [command]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel) return;
    let hls: Hls | undefined;
    let cancelled = false;
    let usingProxy = false;
    let fallbackStarted = false;
    let retryCount = 0;
    let retryTimer: number | undefined;
    let candidateIndex = 0;
    const candidates = [channel.url, ...(channel.alternatives || [])];

    const sourceUrl = () => usingProxy ? proxyUrl(candidates[candidateIndex]) : candidates[candidateIndex];
    const fail = () => {
      if (cancelled) return;
      if (!usingProxy && !fallbackStarted) {
        if (candidateIndex < candidates.length - 1) { candidateIndex += 1; start(false); return; }
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
      onUnavailable?.(channel);
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
      const hintedHls = isHlsUrl(currentUrl);

      if (/profile=htsp|^htsp:/i.test(currentUrl)) {
        if (candidateIndex < candidates.length - 1) { candidateIndex += 1; start(false); return; }
        onUnavailable?.(channel);
        onError("Bu kanalın tarayıcı uyumlu bir yayın adresi bulunamadı.");
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
            if (candidateIndex < candidates.length - 1) { candidateIndex += 1; start(false); return; }
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

  return <div ref={shellRef} className="player-shell"><video ref={videoRef} className={fit === "cover" ? "fill" : ""} controls playsInline poster={channel?.logo} />{!channel && <div className="empty-player"><span>▶</span><strong>Bir kanal seç</strong><small>Yayını burada izlemeye başla</small></div>}</div>;
}
