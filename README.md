# M3U Stream Player

React + Vite + TypeScript tabanlı M3U/M3U8 yayın listesi oynatıcı.

## Yerelde çalıştırma

```bash
pnpm install
pnpm run dev
```

Production build ve server:

```bash
pnpm run build
pnpm run start
```

Server varsayılan olarak `3000` portunda çalışır. `PORT` değişkeniyle farklı bir port verilebilir.

## Özellikler

- M3U/M3U8 playlist ekleme, yenileme ve silme
- Kanal adı ve kategori filtresi
- HLS ve native HLS oynatma
- Playlist kayıtlarını tarayıcı `localStorage` alanında saklama
- M3U/HLS kaynakları için aynı-origin proxy
- `/health` sağlık endpoint’i

## Deployment

Proje `Dockerfile` ile Node.js server olarak çalışır. GitHub repository’si kod deposudur; `/api/proxy` endpoint’i gerektiği için yalnızca GitHub Pages üzerinde yayınlanmamalıdır. Docker destekleyen bir Node.js hosting sağlayıcısı kullanılmalıdır.

Proxy, loopback/private/link-local ağ hedeflerini, sınırsız redirect’leri ve uzun süren upstream isteklerini engeller. Public deployment öncesi hosting sağlayıcısında rate limit ve log izleme de etkinleştirilmelidir.
