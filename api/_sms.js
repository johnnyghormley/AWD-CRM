// Texts through SMS Gateway for Android (sms-gate.app, by capcom6), Cloud server mode (2026-11-19).
// Files starting with _ aren't routes. Nothing secret is in this repo; Johnathon adds these in Vercel himself:
//   SMSGATE_USERNAME, SMSGATE_PASSWORD   Basic auth, shown in the app's Home tab (Cloud server)
//   SMSGATE_SIGNING_KEY                  app → Settings → Webhooks → Signing Key (verifies webhooks)
//   SUPABASE_SECRET_KEY                  lets the webhook save incoming texts (no one is signed in then)
// API (docs.sms-gate.app, read 2026-11-19): POST /3rdparty/v1/messages {id, textMessage:{text}, phoneNumbers:[E.164]},
// GET/POST/DELETE /3rdparty/v1/webhooks {url, event}. Webhooks carry X-Signature = hex HMAC-SHA256(key, rawBody + X-Timestamp).
// Values are never printed or logged.
const crypto = require("crypto");
const { env, SUPABASE_URL } = require("./_lib");

const API = env("SMSGATE_API", "https://api.sms-gate.app/3rdparty/v1");
const WEBHOOK_URL = env("SMSGATE_WEBHOOK_URL", "https://awd-crm.vercel.app/api/sms/webhook");
const EVENTS = ["sms:received", "sms:sent", "sms:delivered", "sms:failed"];

const has = { gateway: () => !!(env("SMSGATE_USERNAME") && env("SMSGATE_PASSWORD")), signing: () => !!env("SMSGATE_SIGNING_KEY"), db: () => !!env("SUPABASE_SECRET_KEY") };
const missing = () => [["SMSGATE_USERNAME", env("SMSGATE_USERNAME")], ["SMSGATE_PASSWORD", env("SMSGATE_PASSWORD")], ["SMSGATE_SIGNING_KEY", env("SMSGATE_SIGNING_KEY")], ["SUPABASE_SECRET_KEY", env("SUPABASE_SECRET_KEY")]].filter(([, v]) => !v).map(([k]) => k);

// Same rule as the CRM's tel(): US numbers to +1XXXXXXXXXX; returns "" for anything that isn't a usable number.
const usable = (v) => v && !/^(unknown|none|n\/a|not found)$/i.test(String(v).trim());
function e164(p) {
  if (!usable(p)) return "";
  const s = String(p).replace(/\s*(x|ext\.?|extension)\s*\d+\s*$/i, "").trim(), d = s.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  if (s.startsWith("+") && d.length >= 8 && d.length <= 15) return "+" + d;
  return "";
}

async function gateway(path, { method = "GET", body } = {}) {
  const auth = Buffer.from(`${env("SMSGATE_USERNAME")}:${env("SMSGATE_PASSWORD")}`).toString("base64");
  const r = await fetch(API + path, { method, headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) { const e = new Error(`Text gateway ${r.status}: ${String((j && (j.message || j.error)) || text || r.statusText).slice(0, 200)}`); e.status = r.status; throw e; }
  return j;
}

// Webhook signature: hex HMAC-SHA256 of the raw body followed by the X-Timestamp value; timestamp within 5 minutes.
function verifySignature(rawBody, headers, now = Date.now()) {
  const key = env("SMSGATE_SIGNING_KEY"), sig = String(headers["x-signature"] || ""), ts = String(headers["x-timestamp"] || "");
  if (!key || !/^[0-9a-f]{64}$/i.test(sig) || !/^\d+$/.test(ts)) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const want = crypto.createHmac("sha256", key).update(rawBody + ts).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig.toLowerCase()), Buffer.from(want));
}

// Supabase with the secret key (server only; skips row rules).
async function sdb(path, { method = "GET", body, prefer } = {}) {
  const k = env("SUPABASE_SECRET_KEY");
  const headers = { apikey: k, "Content-Type": "application/json" };
  if (!k.startsWith("sb_")) headers.Authorization = `Bearer ${k}`;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Database: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// Opt-out (2026-11-19): a reply that is only STOP / UNSUBSCRIBE / CANCEL / END / QUIT (any case); START / UNSTOP opts back in.
// Same rule as optedOut() in app.js. The latest of those replies wins.
const OPT_OUT = /^\s*(stop|unsubscribe|cancel|end|quit)\s*[.!]*\s*$/i, OPT_IN = /^\s*(start|unstop)\s*[.!]*\s*$/i;
const optedOut = (incoming) => { let out = false; (incoming || []).forEach((m) => { if (OPT_OUT.test(m.body)) out = true; else if (OPT_IN.test(m.body)) out = false; }); return out; };

module.exports = { API, WEBHOOK_URL, EVENTS, has, missing, usable, e164, gateway, verifySignature, sdb, OPT_OUT, OPT_IN, optedOut };
