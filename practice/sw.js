// Service worker for the installable Robert app. No caching: every call needs the live server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Robert</title>' +
    '<body style="font-family:system-ui;background:#16202B;color:#fff;display:grid;place-items:center;height:100vh;margin:0">' +
    '<div style="text-align:center"><h2>You\'re offline</h2><p>Robert needs an internet connection. Reconnect and try again.</p></div>',
    { headers: { "Content-Type": "text/html" } })));
});
