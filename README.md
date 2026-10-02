# M3U Stream Player

React + Vite + TypeScript tabanlı M3U/M3U8 yayın listesi oynatıcı.

## Yerelde çalıştırma

```bash
pnpm install
pnpm run dev
```

Production build ve servis:

```bash
pnpm run build
pnpm start
```

## Veri ve trafik mimarisi

- Playlist kayıtları ve ayrıştırılmış kanal verileri kullanıcının cihazındaki IndexedDB'de tutulur.
- M3U playlist alınırken Render proxy güvenlik ve CORS katmanı olarak kullanılır.
- Canlı yayın oynatımında tarayıcı önce kaynak URL'ye **doğrudan** bağlanır.
- Kaynak CORS veya erişim nedeniyle doğrudan oynatılamazsa `/api/proxy` fallback olarak kullanılır.
- Bu tercih, uyumlu yayınlarda canlı video trafiğini Render üzerinden geçirmeyerek outbound bant genişliğini azaltır.
- Fallback proxy, istemci bağlantısı kapandığında upstream bağlantıyı da iptal eder; kopmuş yayınlar sunucuda açık kalmaz.
- Proxy’de varsayılan olarak toplam 60 aktif stream ve istemci IP’si başına 4 aktif stream sınırı vardır; sınırlar `MAX_ACTIVE_STREAMS` ve `MAX_ACTIVE_PER_IP` ortam değişkenleriyle ayarlanabilir.
- `/health` endpointi aktif stream, aktif istemci ve playlist cache sayılarını döndürür.

## Render notları

Render üzerinde `/api/proxy` canlı akış için yalnızca fallback'tir. Çok sayıda yayın kaynağı CORS desteklemiyorsa trafik yine Render üzerinden geçer; bu durumda CDN veya ayrı bir stream gateway gerekir. Render loglarında tekrarlayan instance failure ve yüksek outbound bandwidth görülürse kaynakların doğrudan oynatılıp oynatılmadığı ve proxy fallback oranı kontrol edilmelidir.

Proxy kapasitesi dolduğunda servis kontrollü olarak `429` ve `Retry-After` döndürür; bu, instance’ın bellek veya bağlantı sınırı nedeniyle tamamen çökmesinden daha güvenli davranıştır.
