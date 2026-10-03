// Cloudflare Worker: /api/proxy ve /health. Diğer her şey statik dosya (dist).
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const text = (body, status = 200, extra = {}) =>
  new Response(body, { status, headers: { ...cors, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...extra } });

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const isPrivateHost = (host) => {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "metadata.google.internal") return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b, c] = h.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (h.includes(":")) return h === "[::1]" || h === "[::]" || /^\[(fc|fd|fe80|ff)/.test(h);
  return false;
};

const assertSafe = (url) => {
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only HTTP and HTTPS proxy targets are allowed.");
  if (isPrivateHost(url.hostname)) throw new Error("Private network proxy targets are not allowed.");
};

const fetchUpstream = async (initial) => {
  let target = new URL(initial);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    assertSafe(target);
    const response = await fetch(target.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 M3U-Stream-Player", Accept: "*/*" },
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      target = new URL(location, target);
      continue;
    }
    return { response, resolvedUrl: target.toString() };
  }
  throw new Error("Too many upstream redirects.");
};

const proxyPath = (v) => `/api/proxy?url=${encodeURIComponent(v)}`;

const isManifest = (contentType, url) =>
  /mpegurl|x-mpegurl/i.test(contentType) || /\.m3u8?(?:$|[?#])/i.test(url);

const isMediaSegment = (contentType, url) =>
  /\.(ts|m4s|aac|mp4|webm|mp3)(?:$|[?#])/i.test(url) || /^(video|audio)\//i.test(contentType);

const mediaHeaders = (contentType, cacheControl, upstream) => {
  const headers = { ...cors, "Content-Type": contentType, "Cache-Control": cacheControl };
  for (const name of ["Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  return headers;
};

const rewriteManifest = (source, upstreamUrl) => {
  const base = new URL(upstreamUrl);
  const rewrite = (v) => { try { return proxyPath(new URL(v, base).toString()); } catch { return v; } };
  return source.split(/\r?\n/).map((line) => {
    const v = line.trim();
    if (!v) return line;
    if (v.startsWith("#")) return line.replace(/URI="([^"]+)"/gi, (_m, uri) => `URI="${rewrite(uri)}"`);
    return rewrite(v);
  }).join("\n");
};

async function handleProxy(request, url) {
  const target = url.searchParams.get("url");
  const probe = url.searchParams.get("probe") === "1";
  if (!target) return text("Missing url", 400);

  let targetUrl;
  try { targetUrl = new URL(target); assertSafe(targetUrl); }
  catch (e) { return text(e.message || "Invalid target URL", 400); }

  try {
    const { response: up, resolvedUrl } = await fetchUpstream(targetUrl.toString());
    const contentType = up.headers.get("content-type") || "application/octet-stream";

    if (probe) {
      await up.body?.cancel();
      return new Response(null, { status: up.status, headers: { ...cors, "Content-Type": contentType, "Cache-Control": "no-store", "X-Stream-Resolved-Url": resolvedUrl } });
    }
    if (!up.ok) return new Response(await up.text(), { status: up.status, headers: { ...cors, "Content-Type": contentType, "Cache-Control": "no-store" } });

    if (isManifest(contentType, resolvedUrl)) {
      const source = await up.text();
      const isHls = /\.m3u8(?:$|\?)/i.test(resolvedUrl) || /#EXT-X-/i.test(source);
      const body = isHls ? rewriteManifest(source, resolvedUrl) : source;
      return new Response(body, {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": isHls ? "application/vnd.apple.mpegurl" : contentType,
          "Cache-Control": isHls ? "public, s-maxage=5, max-age=2, stale-while-revalidate=10" : "no-store",
        },
      });
    }

    return new Response(up.body, {
      status: up.status,
      headers: isMediaSegment(contentType, resolvedUrl)
        ? mediaHeaders(contentType, "public, s-maxage=3600, max-age=60", up)
        : { ...cors, "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return json({ error: "upstream_unreachable", message: e instanceof Error ? e.message : "Proxy request failed" }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/health") return json({ ok: true, runtime: "cloudflare-worker" });
    if (url.pathname === "/api/proxy" && request.method === "GET") return handleProxy(request, url);
    if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
