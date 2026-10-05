const VERSION = '1.0.0'; // غيّر هذا الرقم عند كل تحديث للملفات ليُحدَّث التخزين على الأجهزة
const CACHE = 'rafiq-' + VERSION;

const CORE = [
  './', './index.html', './manifest.webmanifest', './storage.js', './check.html',
  './icon-192.png', './icon-512.png', './maskable-192.png', './maskable-512.png',
  './apple-touch-icon.png', './favicon-32.png'
];
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const EXTERNAL = [PDFJS + 'pdf.min.js', PDFJS + 'pdf.worker.min.js'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE); // الملفات المحلية إلزامية
    // الملفات الخارجية (قارئ PDF والخط): محاولة جيدة، لا تُفشل التثبيت
    await Promise.all(EXTERNAL.map(u => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    try {
      const r = await fetch(FONT_CSS, { mode: 'cors' });
      if (r.ok) {
        const css = await r.clone().text();
        await c.put(FONT_CSS, r);
        const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
        await Promise.all(urls.map(u => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
      }
    } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('rafiq-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || r.headers.has('range')) return;
  const u = new URL(r.url);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
  e.respondWith(handle(e, r, u));
});

async function handle(e, r, u) {
  const c = await caches.open(CACHE);
  const hit = await c.match(r, { ignoreVary: true, ignoreSearch: r.mode === 'navigate' });
  const sameOrigin = u.origin === self.location.origin;
  const net = () => fetch(r).then(res => {
    if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()).catch(() => {});
    return res;
  });
  if (hit) {
    // محلي: أعرض المخزَّن فورًا وحدّثه في الخلفية. خارجي (نسخ ثابتة): المخزَّن مباشرة.
    if (sameOrigin) e.waitUntil(net().catch(() => {}));
    return hit;
  }
  try { return await net(); }
  catch (_) {
    if (r.mode === 'navigate') {
      const fb = await c.match('./index.html', { ignoreSearch: true });
      if (fb) return fb;
    }
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}
