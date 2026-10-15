// Service worker for the installable Dex Design Desk app (scope /designs/).
// No offline cache on purpose: design data must always be live from Supabase.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dex Design Desk</title>' +
    '<body style="font-family:system-ui;background:#F4F5F7;color:#1F2937;display:grid;place-items:center;height:100vh;margin:0">' +
    '<div style="text-align:center"><h2>You\'re offline</h2><p>Dex Design Desk needs an internet connection. Reconnect and try again.</p></div>',
    { headers: { "Content-Type": "text/html" } })));
});
