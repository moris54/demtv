# M3U Stream Player — Tasarım Özeti

## Seçilen yön
**Gece Yayını / Editorial Control Room** — canlı yayın keşfini bir medya arşivi ile kontrol odası arasında konumlayan, koyu yüzeyler üzerinde net bilgi hiyerarşisi kuran bir arayüz.

## Tasarım boyutları
- **Tasarım hareketi:** Modern dark editorial + hafif broadcast kontrol odası.
- **Çekirdek ilkeler:** İçerik önce; kanal bilgisi hızlı taranır; oynatıcı her zaman görünür; durumlar açıkça ifade edilir.
- **Renk felsefesi:** Kömür siyahı zemin (#0b0e12), katmanlı grafit paneller (#151a21), sıcak beyaz metin (#f4f6f8) ve canlı mercan vurgu (#ff6b57). İkincil sinyal rengi mint (#7ee7c7).
- **Yerleşim paradigması:** Üstte markalama ve özet metrikler; geniş arama/ekleme bandı; iki kolonlu içerik — sol keşif listesi, sağ sabit oynatıcı.
- **İmza öğeleri:** Mercan yayın noktası, numaralı kanal satırları, monospaced küçük metadata, playlist rozetleri ve ince grid çizgileri.
- **Etkileşim felsefesi:** Anında geri bildirim; her işlem yanında durum mesajı; liste yenileme/silme gibi eylemler görünür ve geri dönüşü anlaşılır.
- **Animasyon:** 160–220ms ease-out geçişler; oynatıcı yüklenirken pulse; gereksiz parallax veya dikkat dağıtan efekt yok.
- **Tipografi sistemi:** Başlıklarda Space Grotesk, arayüz metninde Inter, metadata ve URL'lerde IBM Plex Mono.
- **Marka özü:** “Akışı bul. Yayını başlat.”
- **Marka sesi:** Sakin, teknik ama erişilebilir; Türkçe kısa ve eylem odaklı ifadeler.
- **Wordmark/logo:** İç içe iki yayın dalgasını andıran geometrik “M” sembolü ve M3U Stream yazısı.
- **İmza marka rengi:** Mercan #ff6b57.

## Responsive davranış
Geniş ekranda iki kolon; tablette oyuncu üstte ve liste altta; mobilde oynatıcı, liste ve liste yönetimi tek akışta. Kontroller dokunma hedefi en az 44px.
