// GET /api/ms/callback: Microsoft sends the browser back here after sign-in (the app registration's redirect URI).
// Checks the state and cookie, swaps the code for tokens, refuses the CPA4SBA account, saves the refresh token
// (encrypted, server-only table) and returns to the CRM's Team page.
const ms = require("../_ms");

const back = (res, q) => {
  res.statusCode = 302;
  res.setHeader("Set-Cookie", "awd_ms_oauth=; Path=/api/ms; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", `/?${new URLSearchParams(q)}#/team`);
  res.end();
};
const cookie = (req, name) => (String(req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(name + "=")) || "").slice(name.length + 1);

module.exports = async (req, res) => {
  const q = new URL(req.url, "http://x").searchParams;
  if (q.get("error")) return back(res, { ms: "error", why: (q.get("error_description") || q.get("error")).split(/\r?\n/)[0].slice(0, 160) });
  if (ms.missing().length) return back(res, { ms: "error", why: "Microsoft isn't set up yet." });
  const nonce = ms.readState(q.get("state"));
  if (!nonce || nonce !== cookie(req, "awd_ms_oauth")) return back(res, { ms: "error", why: "That sign-in link expired or came from another browser. Click Connect Microsoft again." });
  try {
    const t = await ms.tokenCall({ grant_type: "authorization_code", code: q.get("code") || "", redirect_uri: ms.REDIRECT_URI });
    if (!t.refresh_token) throw new Error("Microsoft didn't return a refresh token (is offline_access allowed?).");
    const me = await ms.graph(t.access_token, "/me?$select=displayName,mail,userPrincipalName");
    const email = me.mail || me.userPrincipalName || "";
    if (ms.blocked(email)) return back(res, { ms: "error", why: `${email} is the CPA4SBA account. Sign in with AWD's Microsoft 365 account instead.` });
    await ms.saveConnection(t.refresh_token, me);
    back(res, { ms: "connected" });
  } catch (e) {
    back(res, { ms: "error", why: e.message.slice(0, 160) });
  }
};
