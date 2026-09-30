# M3U Stream Player Uygulama Planı

## Mimari ve dağıtım
- Vite + React + TypeScript ile browser-rendered SPA. Geliştirme ve production’da aynı-origin `/api/proxy` katmanı CORS kısıtlı M3U kaynaklarını alır; HLS manifestlerindeki segment ve key URL'lerini de proxy üzerinden yeniden yazar.
- Production için Node container serverı `server.mjs` statik `dist` dosyalarını ve `/api/proxy` endpointini sunar; managed database kullanılmaz, playlist kayıtları cihaz tarafındaki IndexedDB'de tutulur.
- Yayın düzeni hybrid static/server: frontend `dist` olarak static, `/api/*` server route olarak yayınlanır. `Dockerfile` clean checkout üzerinde pnpm install + build + production server başlangıcını tanımlar.
- Versiyonlanmış JS/CSS asset'leri uzun süreli cache'e, HTML ise yeniden doğrulamaya uygun bırakılır.

## Yapı
- `src/App.tsx`: uygulama durumu, playlist ekleme/yükleme/silme, arama/filtre, seçili kanal ve büyük listeler için sanal kanal grid'i.
- `src/storage.ts`: IndexedDB cihaz depolaması ve eski localStorage verisi için geçiş/fallback.
- `src/m3u.ts`: M3U EXTINF ayrıştırıcıları ve yardımcı tipler.
- `src/player.tsx`: native HLS + hls.js oynatma yaşam döngüsü.
- `src/styles.css`: araç ekranı odaklı tam ekran oynatıcı, dokunmatik kanal çekmecesi ve responsive düzen.
- `server.mjs`: production static file server, health endpointi ve streaming M3U/HLS proxy.
- `Dockerfile`: production container build/start sözleşmesi.
- `public/manus-routes.json`: `/` route manifesti.
- `public/favicon.svg`: proje markası.

## Ürün davranışı
Bir veya daha fazla URL eklenir, proxy üzerinden alınır, M3U satırları kanal nesnelerine çevrilir. Ek parametre taşıyan `#EXTM3U` başlıkları da kabul edilir. Kanal listesi isim ve kategoriye göre filtrelenir; büyük listelerde yalnızca görünür kanal satırları DOM'a alınır. Seçili kanal video içinde açılır. Native HLS olmayan tarayıcılarda hls.js kullanılır. URL, başlık ve kanallar cihaz IndexedDB'sinde korunur; eski localStorage kayıtları ilk açılışta taşınır. Fetch/CORS, geçersiz liste ve playback hataları Türkçe gösterilir.

## Doğrulama
TypeScript derlemesi ve Vite production build çalıştırılacak; production server health/index endpointleri ve gerçek M3U proxy yanıtı doğrulanacak; `/manus-routes.json` HTTP 200 ve geçerli JSON olarak doğrulanacak; source inspection ile tüm kabul kriterleri kontrol edilecek.
