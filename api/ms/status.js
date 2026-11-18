// GET /api/ms/status: is Microsoft set up and connected, and as whom. Any signed-in CRM user (shown on lead pages).
// Never returns a token.
const { send, requireUser } = require("../_lib");
const ms = require("../_ms");

module.exports = async (req, res) => {
  if (!(await requireUser(req, res))) return;
  const need = ms.missing();
  const out = { configured: !need.length, missing: need, connected: false, redirect_uri: ms.REDIRECT_URI, scopes: ms.SCOPES };
  if (need.length) return send(res, 200, out);
  try {
    const c = await ms.getConnection();
    if (c) Object.assign(out, { connected: true, account_email: c.account_email, account_name: c.account_name, connected_at: c.connected_at });
  } catch (e) { out.error = e.message; }
  send(res, 200, out);
};
