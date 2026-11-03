// Unsubscribe link in every campaign email. No login: the token in the link identifies one recipient.
// GET  /api/unsubscribe?t=…  → page with a confirm button (so link scanners can't unsubscribe people by visiting)
// POST /api/unsubscribe?t=…  → records it; mail apps' one-click unsubscribe (List-Unsubscribe-Post) also lands here
// The address is never emailed again. If HubSpot is connected, a note is added to the contact.
const { settings, db, hubspot } = require("./_lib");

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#F5F8FA;color:#1F2937;margin:0;display:grid;place-items:center;min-height:100vh">
<div style="background:#fff;border:1px solid #DFE3EB;border-radius:10px;padding:28px;max-width:420px;margin:16px;text-align:center">${body}</div></body></html>`;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

module.exports = async (req, res) => {
  const t = new URL(req.url, "http://x").searchParams.get("t") || "";
  const business = esc(settings().business);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (!/^[0-9a-f-]{36}$/i.test(t)) { res.statusCode = 400; return res.end(page("Unsubscribe", "<h2>This unsubscribe link isn't valid.</h2><p>Reply to the email and ask to be removed, and we'll take care of it.</p>")); }
  if (req.method === "GET") {
    return res.end(page("Unsubscribe", `<h2>Unsubscribe</h2><p>Stop receiving emails from ${business}?</p>
      <form method="post" action="/api/unsubscribe?t=${t}"><button style="font:inherit;font-weight:bold;background:#FACC15;color:#1F2937;border:0;border-radius:6px;padding:12px 22px;cursor:pointer">Unsubscribe me</button></form>`));
  }
  try {
    const r = await db(null, "rpc/campaign_unsubscribe", { method: "POST", body: { p_token: t } });
    if (r && r.first && r.contact_id && settings().hubspot) {
      await hubspot("/crm/v3/objects/notes", { method: "POST", body: {
        associations: [{ to: { id: r.contact_id }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
        properties: { hs_timestamp: new Date().toISOString(), hs_note_body: `Unsubscribed from ${settings().business} campaign emails (${r.email}). Don't email again.` } } }).catch(() => {});
    }
    res.end(page("Unsubscribed", `<h2>You're unsubscribed</h2><p>${r ? esc(r.email) + " won't" : "You won't"} get any more emails from ${business}.</p>`));
  } catch (e) {
    res.statusCode = 500;
    res.end(page("Unsubscribe", "<h2>Something went wrong.</h2><p>Reply to the email and ask to be removed, and we'll take care of it.</p>"));
  }
};
