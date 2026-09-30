import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isHttpUrl = (value: string) => value.startsWith("http://") || value.startsWith("https://");

function streamProxy() {
  return {
    name: "m3u-stream-proxy",
    configureServer(server: { middlewares: { use: (path: string, handler: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use("/api/proxy", async (req, res, next) => {
        let closed = false;
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        const safeEnd = (body?: string | Buffer) => { if (!closed && !res.writableEnded) res.end(body); };
        const safeWrite = (chunk: Buffer) => { if (!closed && !res.writableEnded) res.write(chunk); };
        res.on("close", () => { closed = true; void reader?.cancel(); });
        res.on("error", () => { closed = true; });
        const requestUrl = new URL(req.url || "/", "http://localhost");
        const target = requestUrl.searchParams.get("url");
        const probe = requestUrl.searchParams.get("probe") === "1";
        if (!target || !isHttpUrl(target)) { res.statusCode = 400; safeEnd("Geçersiz yayın URL'si"); return; }
        try {
          const upstream = await fetch(target, { redirect: "follow", headers: { "User-Agent": "M3U-Stream-Player/1.0" } });
          if (!upstream.ok) { res.statusCode = upstream.status; safeEnd(`Kaynak yanıt vermedi (${upstream.status})`); return; }
          const contentType = upstream.headers.get("content-type") || "application/octet-stream";
          res.statusCode = 200;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "no-store");
          if (probe) {
            res.setHeader("Content-Type", contentType);
            res.setHeader("X-Stream-Resolved-Url", upstream.url || target);
            await upstream.body?.cancel();
            safeEnd();
            return;
          }
          if (contentType.includes("mpegurl") || /\.m3u8(?:$|\?)/i.test(target)) {
            const source = await upstream.text();
            const isHlsManifest = /\.m3u8(?:$|\?)/i.test(target) || /#EXT-X-/i.test(source);
            if (!isHlsManifest) {
              res.setHeader("Content-Type", contentType);
              safeEnd(source);
              return;
            }
            const base = new URL(upstream.url || target);
            const rewriteUri = (value: string) => {
              try { return `/api/proxy?url=${encodeURIComponent(new URL(value, base).toString())}`; } catch { return value; }
            };
            const rewritten = source.split(/\r?\n/).map((line: string) => {
              const value = line.trim();
              if (!value) return line;
              if (value.startsWith("#")) return line.replace(/URI="([^"]+)"/gi, (_match, uri: string) => `URI="${rewriteUri(uri)}"`);
              return rewriteUri(value);
            }).join("\n");
            res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
            safeEnd(rewritten);
          } else {
            res.setHeader("Content-Type", contentType);
            if (!upstream.body) { safeEnd(); return; }
            reader = upstream.body.getReader();
            try {
              while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                safeWrite(Buffer.from(chunk.value));
              }
            } finally { safeEnd(); reader.releaseLock(); reader = undefined; }
          }
        } catch (error) {
          if (!closed && !res.writableEnded) { res.statusCode = 502; safeEnd(error instanceof Error ? `Kaynak alınamadı: ${error.message}` : "Kaynak alınamadı"); }
        }
      });
    },
  };
}

export default defineConfig({ plugins: [react(), streamProxy()] });
