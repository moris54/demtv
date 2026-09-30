export type Channel = {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
};

const attribute = (line: string, key: string) => {
  const quoted = line.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`, "i"));
  if (quoted?.[1]) return quoted[1].trim();
  const loose = line.match(new RegExp(`${key}\\s*=\\s*([^\\s,]+)`, "i"));
  return loose?.[1]?.trim();
};

const resolveUrl = (value: string, baseUrl?: string) => {
  try { return baseUrl ? new URL(value, baseUrl).toString() : new URL(value).toString(); } catch { return undefined; }
};

const makeChannel = (info: string | undefined, url: string, baseUrl?: string, fallbackName = "Canlı yayın"): Channel | undefined => {
  const resolved = resolveUrl(url, baseUrl);
  if (!resolved || !/^https?:\/\//i.test(resolved)) return undefined;
  const comma = info?.indexOf(",") ?? -1;
  const name = (comma >= 0 ? info!.slice(comma + 1).trim() : "") || attribute(info || "", "tvg-name") || fallbackName;
  const logo = attribute(info || "", "tvg-logo") || attribute(info || "", "logo");
  const group = attribute(info || "", "group-title") || attribute(info || "", "group") || "Diğer";
  const tvgId = attribute(info || "", "tvg-id");
  return { id: `${tvgId || name}-${resolved}`, name, url: resolved, logo, group, tvgId };
};

export function parseM3U(text: string, baseUrl?: string): Channel[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const hasM3UHeader = lines.some((line) => line.toUpperCase().startsWith("#EXTM3U"));
  const hasExtInf = lines.some((line) => line.toUpperCase().startsWith("#EXTINF"));
  const hasHlsMaster = lines.some((line) => line.toUpperCase().startsWith("#EXT-X-STREAM-INF"));
  if (!hasM3UHeader && !hasExtInf && !hasHlsMaster) throw new Error("Bu bağlantı M3U/M3U8 playlist formatında görünmüyor.");

  const channels: Channel[] = [];
  const seen = new Set<string>();
  let pendingInfo: string | undefined;
  let pendingName = "Canlı yayın";
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith("#EXTINF")) { pendingInfo = line; continue; }
    if (upper.startsWith("#EXT-X-STREAM-INF")) { pendingInfo = undefined; pendingName = attribute(line, "NAME") || "Canlı yayın"; continue; }
    if (line.startsWith("#")) continue;
    const channel = makeChannel(pendingInfo, line, baseUrl, pendingName);
    if (channel && !seen.has(channel.url)) { channels.push(channel); seen.add(channel.url); }
    pendingInfo = undefined;
    pendingName = "Canlı yayın";
  }
  if (!channels.length) throw new Error("Playlist metni bulundu ancak içinde geçerli HTTP/HTTPS yayın adresi bulunamadı.");
  return channels;
}
