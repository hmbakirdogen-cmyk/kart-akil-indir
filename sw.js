/*
 * NE: Her web exportunda HTML parmak iziyle değişen KartAkıl PWA kabuk sürümüdür.
 * NEDEN: Service worker dosyası değişmezse tarayıcı yeni uygulama paketini görünür bir güncelleme olarak algılamaz.
 * NASIL: pwa-hazirla.mjs be6baea219e7 yer tutucusunu export HTML'inin kısa SHA-256 özetiyle değiştirir.
 * YAN ETKİ: Yeni deploy eski KartAkıl kabuk cache'ini temizler; Supabase ve diğer projelerin cache'lerine dokunmaz.
 */
const CACHE = "kartakil-kabuk-be6baea219e7";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  /*
   * NE: Yalnız KartAkıl'a ait eski önbellek sürümlerini temizler.
   * NEDEN: Cache Storage alan adı genelindedir; önceki filtre aynı GitHub Pages alanındaki başka
   *        uygulamaların cache'lerini de silebilirdi.
   * NASIL: `kartakil-` öneki dışındaki anahtarlara dokunmaz, yalnız eski KartAkıl sürümlerini kaldırır.
   * YAN ETKİ: Diğer projelerin çevrimdışı verisi korunur; KartAkıl eski kabuğu yine temizlenir.
   */
  e.waitUntil(
    (async () => {
      const anahtarlar = await caches.keys();
      await Promise.all(
        anahtarlar
          .filter((k) => k.startsWith("kartakil-") && k !== CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const istek = e.request;
  if (istek.method !== "GET") return;
  /*
   * NE:       Sayfa (navigasyon) isteği tarayıcının HTTP önbelleğini ATLAYARAK ağdan alınır.
   * NEDEN:    GitHub Pages index.html'i `Cache-Control: max-age=600` ile veriyor. Varsayılan fetch bu
   *           önbelleği kullandığı için yeni sürüm yayınlandıktan sonra 10 dakika boyunca kullanıcıya
   *           ESKİ sayfa (dolayısıyla eski uygulama paketi) dönüyordu — "yayınladım ama telefonumda yok"
   *           şikâyetinin ikinci kökü buydu (2026-07-25).
   * NASIL:    Yalnız navigasyon isteklerinde `cache: "reload"`; JS/görsel gibi parmak izli varlıklar
   *           dosya adında hash taşıdığı için önbellekten gelmeye devam eder (hızlı açılış korunur).
   * YAN ETKİ: Her açılışta tek küçük HTML isteği tazelenir; çevrimdışıyken zaten catch dalına düşüp
   *           önbellekteki kabuk döner — çevrimdışı davranış bozulmaz.
   */
  const navigasyon = istek.mode === "navigate";
  e.respondWith(
    (async () => {
      try {
        /*
         * Navigasyonda Request nesnesi yerine URL ile taze istek kurulur: `new Request(navigasyonIstegi, init)`
         * kipi "navigate"ten "same-origin"e düşürür ve yönlendirme davranışını değiştirir; URL ile kurmak
         * bu köşeyi tamamen atlar ve statik barındırmada birebir aynı HTML'i getirir.
         */
        const yanit = await (navigasyon
          ? fetch(istek.url, { cache: "reload", credentials: "same-origin" })
          : fetch(istek));
        // Sadece kendi statik kabuğumuzu önbelleğe al (Supabase/harici API'ye dokunma)
        if (yanit.ok && istek.url.includes("/kart-akil-indir/")) {
          const kopya = yanit.clone();
          /*
           * NE: Statik cevabın önbellek yazımını fetch yaşam döngüsü içinde tamamlar.
           * NEDEN: Sahipsiz Promise tarayıcı olayı kapanınca yarıda kesilip çevrimdışı kabuğu eksik bırakabilirdi.
           * NASIL: Cache açma/yazma işlemini yanıt dönmeden önce best-effort bekler.
           * YAN ETKİ: İlk ağ yanıtına küçük bir cache yazım maliyeti eklenir; sonraki çevrimdışı açılış güvenilirleşir.
           */
          try {
            const onbellek = await caches.open(CACHE);
            await onbellek.put(istek, kopya);
          } catch {}
        }
        return yanit;
      } catch {
        const onbellek = await caches.match(istek);
        return onbellek || Response.error();
      }
    })(),
  );
});
