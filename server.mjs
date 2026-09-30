import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "dist");
const port = Number(process.env.PORT || 3000);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".json": "application/json" };

const headers = (res, contentType) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Cache-Control", "no-store"); if (contentType) res.setHeader("Content-Type", contentType); };
const proxyPath = (value) => `/api/proxy?url=${encodeURIComponent(value)}`;
const rewriteManifest = (source, upstreamUrl) => {
  const base = new URL(upstreamUrl);
  const rewrite = (value) => { try { return proxyPath(new URL(value, base).toString()); } catch { return value; } };
  return source.split(/\r?\n/).map((line) => {
    const value = line.trim();
    if (!value) return line;
    if (value.startsWith("#")) return line.replace(/URI="([^"]+)"/gi, (_match, uri) => `URI="${rewrite(uri)}"`);
    return rewrite(value);
  }).join("\n");
};

async function handleProxy(req, res, requestUrl) {
  const target = requestUrl.searchParams.get("url");
  const probe = requestUrl.searchParams.get("probe") === "1";
  if (!target) { res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }); res.end("Missing url"); return; }
  let targetUrl;
  try { targetUrl = new URL(target); if (!/^https?:$/.test(targetUrl.protocol)) throw new Error(); } catch { res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }); res.end("Invalid target URL"); return; }
  try {
    const upstream = await fetch(targetUrl, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 M3U-Stream-Player", Accept: "*/*" } });
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.statusCode = upstream.status;
    headers(res, contentType);
    if (probe) { res.setHeader("X-Stream-Resolved-Url", upstream.url || targetUrl.toString()); await upstream.body?.cancel(); res.end(); return; }
    if (!upstream.ok) { const message = await upstream.text(); res.end(message); return; }
    if (/mpegurl|x-mpegurl/i.test(contentType) || /\.m3u8(?:$|\?)/i.test(targetUrl.toString())) {
      const source = await upstream.text();
      const isHlsManifest = /\.m3u8(?:$|\?)/i.test(targetUrl.toString()) || /#EXT-X-/i.test(source);
      res.setHeader("Content-Type", isHlsManifest ? "application/vnd.apple.mpegurl" : contentType);
      res.end(isHlsManifest ? rewriteManifest(source, upstream.url || targetUrl.toString()) : source);
      return;
    }
    if (!upstream.body) { res.end(); return; }
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    if (!res.headersSent) { res.statusCode = 502; headers(res, "application/json; charset=utf-8"); res.end(JSON.stringify({ error: "upstream_unreachable", message: error instanceof Error ? error.message : "Proxy request failed" })); }
  }
}

function serveStatic(req, res, requestUrl) {
  let requested = decodeURIComponent(requestUrl.pathname);
  if (requested === "/") requested = "/index.html";
  if (requested.includes("..")) { res.writeHead(400); res.end("Bad path"); return; }
  let filePath = path.join(publicDir, requested);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    if (!path.extname(requested)) filePath = path.join(publicDir, "index.html");
    else { res.writeHead(404); res.end("Not found"); return; }
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS", "Access-Control-Allow-Headers": "*" }); res.end(); return; }
  if (requestUrl.pathname === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true })); return; }
  if (requestUrl.pathname === "/api/proxy" && req.method === "GET") { await handleProxy(req, res, requestUrl); return; }
  if (requestUrl.pathname.startsWith("/api/")) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "not_found" })); return; }
  serveStatic(req, res, requestUrl);
});

server.listen(port, "0.0.0.0", () => console.log(`M3U Stream Player server listening on ${port}`));
