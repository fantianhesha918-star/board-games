/* チンチラのボードゲーム — オフライン対応 Service Worker
   デプロイのたびに VERSION を上げること（古いキャッシュを掃除するトリガー）。 */
const VERSION = "2026-09-11b";
const CACHE = "bg-" + VERSION;

const CORE = [
  "./",
  "./index.html", "./rules.html", "./trump.html", "./stats.html",
  "./daifugo.html", "./babanuki.html", "./sevens.html",
  "./memory.html", "./solitaire.html", "./sudoku.html",
  "./pwa.js", "./stats.js", "./online.js", "./firebase-init.js",
  "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./icon-512-maskable.png",
  "./apple-touch-icon.png", "./favicon.ico"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.allSettled(CORE.map(u => c.add(u))))
  );
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  // Firebase・CDN など別オリジンは素通し（オンライン対戦に干渉しない）
  if (url.origin !== location.origin) return;

  const isHTML = req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    // HTML はネット優先（更新をすぐ反映）、落ちたらキャッシュ
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
        return res;
      } catch {
        return (await caches.match(req)) ||
               (await caches.match("./index.html")) ||
               Response.error();
      }
    })());
    return;
  }

  // それ以外（JS・画像・webp）はキャッシュ優先＋裏で更新
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req).then(res => {
      if (res && res.ok && res.type === "basic") {
        caches.open(CACHE).then(c => c.put(req, res.clone()));
      }
      return res;
    }).catch(() => null);
    return cached || (await net) || Response.error();
  })());
});
