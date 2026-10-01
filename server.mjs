import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import net from "node:net";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "dist");
const port = Number(process.env.PORT || 3000);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".json": "application/json" };
const MAX_REDIRECTS = 5;
const UPSTREAM_TIMEOUT_MS = 15_000;

const headers = (res, contentType) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Cache-Control", "no-store"); if (contentType) res.setHeader("Content-Type", contentType); };
const proxyPath = (value) => `/api/proxy?url=${encodeURIComponent(value)}`;

const isBlockedIp = (address) => {
  const normalized = address.toLowerCase();
  if (net.isIPv4(address)) {
    const [a, b, c] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (!net.isIPv6(address)) return true;
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80") || normalized.startsWith("ff")) return true;
  if (normalized.startsWith("::ffff:")) return isBlockedIp(normalized.slice(7));
  return false;
};

const assertSafeTarget = async (target) => {
  if (!/^https?:$/.test(target.protocol)) throw new Error("Only HTTP and HTTPS proxy targets are allowed.");
  const hostname = target.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "metadata.google.internal") throw new Error("Private network proxy targets are not allowed.");
  const addresses = net.isIP(hostname) ? [hostname] : (await dns.lookup(hostname, { all: true })).map(({ address }) => address);
  if (!addresses.length || addresses.some(isBlockedIp)) throw new Error("Private network proxy targets are not allowed.");
};

const fetchUpstream = async (initialUrl) => {
  let target = new URL(initialUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertSafeTarget(target);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const response = await fetch(target, { redirect: "manual", signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 M3U-Stream-Player", Accept: "*/*" } });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        target = new URL(location, target);
        continue;
      }
      return { response, resolvedUrl: target.toString(), controller };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Too many upstream redirects.");
};

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
  try { targetUrl = new URL(target); await assertSafeTarget(targetUrl); } catch (error) { res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }); res.end(error instanceof Error ? error.message : "Invalid target URL"); return; }
  try {
    const { response: upstream, resolvedUrl, controller } = await fetchUpstream(targetUrl.toString());
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.statusCode = upstream.status;
    headers(res, contentType);
    if (probe) { res.setHeader("X-Stream-Resolved-Url", resolvedUrl); await upstream.body?.cancel(); res.end(); return; }
    if (!upstream.ok) { const message = await upstream.text(); res.end(message); return; }
    if (/mpegurl|x-mpegurl/i.test(contentType) || /\.m3u8(?:$|\?)/i.test(resolvedUrl)) {
      const source = await upstream.text();
      const isHlsManifest = /\.m3u8(?:$|\?)/i.test(resolvedUrl) || /#EXT-X-/i.test(source);
      res.setHeader("Content-Type", isHlsManifest ? "application/vnd.apple.mpegurl" : contentType);
      res.end(isHlsManifest ? rewriteManifest(source, resolvedUrl) : source);
      return;
    }
    if (!upstream.body) { res.end(); return; }
    const source = Readable.fromWeb(upstream.body);
    const abortUpstream = () => controller.abort();
    req.once("aborted", abortUpstream);
    res.once("close", abortUpstream);
    try { await pipeline(source, res); } catch (error) {
      if (!res.destroyed && !res.headersSent) { res.statusCode = 502; res.end(JSON.stringify({ error: "stream_failed" })); }
    } finally {
      req.off("aborted", abortUpstream);
      res.off("close", abortUpstream);
    }
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
