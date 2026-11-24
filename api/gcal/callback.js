// GET /api/gcal/callback: Google sends the browser back here after sign-in (the OAuth client's redirect URI).
// Checks the state and cookie, swaps the code for tokens, saves the refresh token (encrypted, server-only table),
// marks every upcoming CRM meeting to be sent to Google, and returns to the CRM's Team page.
const g = require("../_gcal");

const back = (res, q) => {
  res.statusCode = 302;
  res.setHeader("Set-Cookie", "awd_gcal_oauth=; Path=/api/gcal; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", `/?${new URLSearchParams(q)}#/team`);
  res.end();
};
const cookie = (req, name) => (String(req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(name + "=")) || "").slice(name.length + 1);

module.exports = async (req, res) => {
  const q = new URL(req.url, "http://x").searchParams;
  if (q.get("error")) return back(res, { gcal: "error", why: String(q.get("error")).slice(0, 160) });
  if (g.missing().length) return back(res, { gcal: "error", why: "Google Calendar isn't set up yet." });
  const nonce = g.readState(q.get("state"));
  if (!nonce || nonce !== cookie(req, "awd_gcal_oauth")) return back(res, { gcal: "error", why: "That sign-in link expired or came from another browser. Click Connect Google Calendar again." });
  try {
    const t = await g.tokenCall({ grant_type: "authorization_code", code: q.get("code") || "", redirect_uri: g.REDIRECT_URI });
    if (!t.refresh_token) throw new Error("Google didn't return a refresh token. Remove the CRM's access at myaccount.google.com/permissions and connect again.");
    if (!String(t.scope || "").includes("calendar.events")) throw new Error("Calendar access wasn't allowed. Connect again and tick the calendar box.");
    const now = new Date().toISOString();
    await g.saveConnection({ refresh_token_enc: g.encrypt(t.refresh_token), account_email: g.emailFromIdToken(t.id_token), connected_at: now, last_pull_at: null, last_error: null });
    // Upcoming meetings and call backs not in Google yet go there on the first sync.
    await g.sdb(`meetings?status=eq.scheduled&google_event_id=is.null&kind=neq.Google&starts_at=gte.${encodeURIComponent(now)}`, { method: "PATCH", body: { google_dirty: true, google_synced_at: now }, prefer: "return=minimal" });
    back(res, { gcal: "connected" });
  } catch (e) {
    back(res, { gcal: "error", why: e.message.slice(0, 160) });
  }
};
