/* KartAkıl service worker — PWA "yükle" için installability + basit çevrimdışı kabuk.
   Ağ-öncelikli (canlı Supabase verisi hep taze); ağ yoksa önbellekten döner. */
const CACHE = "kartakil-kabuk-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const anahtarlar = await caches.keys();
      await Promise.all(anahtarlar.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const istek = e.request;
  if (istek.method !== "GET") return;
  e.respondWith(
    (async () => {
      try {
        const yanit = await fetch(istek);
        // Sadece kendi statik kabuğumuzu önbelleğe al (Supabase/harici API'ye dokunma)
        if (yanit.ok && istek.url.includes("/kart-akil-indir/")) {
          const kopya = yanit.clone();
          caches.open(CACHE).then((c) => c.put(istek, kopya)).catch(() => {});
        }
        return yanit;
      } catch {
        const onbellek = await caches.match(istek);
        return onbellek || Response.error();
      }
    })(),
  );
});
