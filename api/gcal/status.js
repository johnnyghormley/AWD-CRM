// GET /api/gcal/status: is Google Calendar set up and connected, and as whom. Never returns a token.
// Without sign-in it only says which Vercel variables are still missing (names, not values).
const { send, requireUser } = require("../_lib");
const g = require("../_gcal");

module.exports = async (req, res) => {
  const need = g.missing();
  const out = { configured: !need.length, missing: need, connected: false, redirect_uri: g.REDIRECT_URI };
  if (!req.headers.authorization) return send(res, 200, out);
  if (!(await requireUser(req, res))) return;
  if (need.length) return send(res, 200, out);
  try {
    const c = await g.getConnection();
    if (c) Object.assign(out, { connected: true, account_email: c.account_email, connected_at: c.connected_at, last_sync_at: c.last_sync_at, last_error: c.last_error });
    const errs = await g.sdb("meetings?google_error=not.is.null&select=id&limit=50");
    out.meetings_with_errors = errs.length;
  } catch (e) { out.error = e.message; out.code = e.code; }
  send(res, 200, out);
};
