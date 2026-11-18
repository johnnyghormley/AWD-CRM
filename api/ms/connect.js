// POST /api/ms/connect: admins only. Returns the Microsoft sign-in URL; the CRM page then goes there.
// A signed, 10-minute state plus a matching HttpOnly cookie make sure the callback finishes the sign-in this browser started.
// POST /api/ms/connect { disconnect: true }: forget the connected account (the CRM stops making Teams links).
const crypto = require("crypto");
const { send, requireAdmin, readJson } = require("../_lib");
const ms = require("../_ms");

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  if (!(await requireAdmin(req, res))) return;
  const need = ms.missing();
  if (need.length) return send(res, 400, { error: `Microsoft isn't set up yet (missing in Vercel: ${need.join(", ")}).` });
  const body = await readJson(req).catch(() => ({}));
  if (body.disconnect) {
    try { await ms.sdb("ms_connection?id=eq.1", { method: "DELETE" }); return send(res, 200, { ok: true }); }
    catch (e) { return send(res, 500, { error: e.message }); }
  }
  const nonce = crypto.randomBytes(16).toString("hex");
  res.setHeader("Set-Cookie", `awd_ms_oauth=${nonce}; Path=/api/ms; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  send(res, 200, { url: ms.authorizeUrl(ms.makeState(nonce)) });
};
