// Microsoft 365 / Teams helpers for the api/ms/* server functions (2026-11-18). Files starting with _ aren't routes.
// Johnathon registers the app in Microsoft Entra (AWD's own Microsoft 365 business account, never the CPA4SBA one)
// and adds these Vercel environment variables himself; nothing secret is in this repo:
//   MS_CLIENT_ID, MS_TENANT_ID, MS_CLIENT_SECRET   the Entra app registration
//   SUPABASE_SECRET_KEY                            lets the server read/write the locked ms_connection table
// Delegated scopes: offline_access User.Read Calendars.ReadWrite OnlineMeetings.ReadWrite
// Redirect URI (must match the app registration exactly): https://awd-crm.vercel.app/api/ms/callback
const crypto = require("crypto");
const { env, SUPABASE_URL } = require("./_lib");

const REDIRECT_URI = env("MS_REDIRECT_URI", "https://awd-crm.vercel.app/api/ms/callback");
const SCOPES = "offline_access User.Read Calendars.ReadWrite OnlineMeetings.ReadWrite";
const TZ = "America/Chicago";
// Never connect the CPA4SBA account (Johnathon 2026-11-18: AWD has its own Microsoft 365 account).
const BLOCKED_DOMAINS = ["cpa4sba.com"];

const cfg = () => ({ clientId: env("MS_CLIENT_ID"), tenant: env("MS_TENANT_ID"), secret: env("MS_CLIENT_SECRET"), dbKey: env("SUPABASE_SECRET_KEY") });
// Names of the Vercel variables still missing (empty = ready).
const missing = () => { const c = cfg(); return [["MS_CLIENT_ID", c.clientId], ["MS_TENANT_ID", c.tenant], ["MS_CLIENT_SECRET", c.secret], ["SUPABASE_SECRET_KEY", c.dbKey]].filter(([, v]) => !v).map(([k]) => k); };

// ---- crypto: refresh token encrypted at rest; OAuth state signed ----
const keyFor = (purpose) => crypto.createHash("sha256").update(`awd-ms:${purpose}:${cfg().secret}`).digest();
const b64u = (buf) => Buffer.from(buf).toString("base64url");
function encrypt(text) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", keyFor("token"), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [b64u(iv), b64u(c.getAuthTag()), b64u(enc)].join(".");
}
function decrypt(blob) {
  const [iv, tag, enc] = String(blob || "").split(".").map((p) => Buffer.from(p, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", keyFor("token"), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
const sign = (data) => crypto.createHmac("sha256", keyFor("state")).update(data).digest("base64url");
function makeState(nonce) {
  const data = b64u(JSON.stringify({ n: nonce, exp: Date.now() + 10 * 60 * 1000 }));
  return `${data}.${sign(data)}`;
}
// Returns the nonce inside a valid, unexpired state, or null.
function readState(state) {
  const [data, sig] = String(state || "").split(".");
  if (!data || !sig) return null;
  const want = sign(data);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const s = JSON.parse(Buffer.from(data, "base64url").toString("utf8")); return s.exp > Date.now() ? s.n : null; } catch { return null; }
}

// ---- Supabase with the secret key (skips row rules; server only) ----
async function sdb(path, { method = "GET", body, prefer } = {}) {
  const k = cfg().dbKey;
  const headers = { apikey: k, "Content-Type": "application/json" };
  if (!k.startsWith("sb_")) headers.Authorization = `Bearer ${k}`; // older JWT-style service_role key
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) {
    if (/ms_connection|teams_join_url|ms_event_id|teams_error/.test(text) && /(does not exist|Could not find|schema cache)/i.test(text)) throw new Error("Microsoft Teams isn't set up in the database yet: run teams.sql in Supabase.");
    throw new Error(`Database: ${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : null;
}
const getConnection = async () => ((await sdb("ms_connection?id=eq.1&select=*")) || [])[0] || null;

// ---- Microsoft identity + Graph ----
function authorizeUrl(state) {
  const c = cfg();
  const q = new URLSearchParams({ client_id: c.clientId, response_type: "code", redirect_uri: REDIRECT_URI, response_mode: "query", scope: SCOPES, state, prompt: "select_account" });
  return `https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/authorize?${q}`;
}
async function tokenCall(params) {
  const c = cfg();
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.secret, scope: SCOPES, ...params }).toString()
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Microsoft sign-in: ${j.error_description ? j.error_description.split("\r")[0].slice(0, 200) : r.status}`);
  return j;
}
async function saveConnection(refreshToken, me) {
  const row = { id: 1, refresh_token_enc: encrypt(refreshToken), updated_at: new Date().toISOString() };
  if (me) Object.assign(row, { account_email: me.mail || me.userPrincipalName || null, account_name: me.displayName || null, connected_at: row.updated_at });
  await sdb("ms_connection?on_conflict=id", { method: "POST", body: row, prefer: "resolution=merge-duplicates,return=minimal" });
}
// A fresh access token from the saved refresh token (Microsoft may rotate the refresh token; the new one is saved).
async function accessToken() {
  const conn = await getConnection();
  if (!conn) { const e = new Error("Microsoft isn't connected."); e.code = "not_connected"; throw e; }
  let refresh;
  try { refresh = decrypt(conn.refresh_token_enc); } catch { const e = new Error("Microsoft needs to be connected again."); e.code = "not_connected"; throw e; }
  const t = await tokenCall({ grant_type: "refresh_token", refresh_token: refresh });
  if (t.refresh_token && t.refresh_token !== refresh) await saveConnection(t.refresh_token).catch(() => {});
  return t.access_token;
}
async function graph(at, path, { method = "GET", body } = {}) {
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method, headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  if (!r.ok) { let m = text; try { m = JSON.parse(text).error.message; } catch {} const e = new Error(`Microsoft ${r.status}: ${String(m).slice(0, 200)}`); e.status = r.status; throw e; }
  return text ? JSON.parse(text) : null;
}
const blocked = (email) => BLOCKED_DOMAINS.some((d) => String(email || "").toLowerCase().endsWith("@" + d));

// "2026-11-20T15:30:00" in Houston time, for Graph's { dateTime, timeZone } pairs.
function chicagoLocal(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(date)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

module.exports = { REDIRECT_URI, SCOPES, TZ, cfg, missing, encrypt, decrypt, makeState, readState, sdb, getConnection, authorizeUrl, tokenCall, saveConnection, accessToken, graph, blocked, chicagoLocal };
