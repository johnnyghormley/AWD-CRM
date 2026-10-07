// Service worker for the installable AWD CRM app.
// Deliberately no offline cache: lead data must always be live from Supabase, so every
// request goes straight to the network. Pages only get a simple "you're offline" fallback.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // everything else: browser default (network)
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>AWD CRM</title>' +
    '<body style="font-family:system-ui;background:#F3F4F6;color:#1F2937;display:grid;place-items:center;height:100vh;margin:0">' +
    '<div style="text-align:center"><h2>You\'re offline</h2><p>The CRM needs an internet connection. Reconnect and try again.</p></div>',
    { headers: { "Content-Type": "text/html" } })));
});
