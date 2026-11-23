// Service worker: rende l'app disponibile offline. Non tocca mai le richieste verso Google.
const VERSIONE = "1.0.2";
const CACHE = "quiet-ledger-" + VERSIONE;
const FILE = ["./", "index.html", "stile.css", "manifest.webmanifest", "js/app.js", "js/archivio.js", "js/analisi.js",
  "js/cripto.js", "js/drive.js", "js/sync.js", "js/config.js", "js/vendor/jsQR.js",
  "icone/icona-192.png", "icone/icona-512.png", "icone/apple-touch-icon.png"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILE))));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((k) => Promise.all(k.filter((n) => n.startsWith("quiet-ledger-") && n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;  // Google Drive: sempre dalla rete, mai in cache
  // prima la rete (così configurazione e aggiornamenti arrivano subito), la copia salvata solo senza connessione
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
