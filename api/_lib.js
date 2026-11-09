// Shared helpers for the Campaigns server functions (files starting with _ are not routes on Vercel).
// Secrets come only from Vercel environment variables; nothing secret is in this repo.

// Same public values as config.js (the publishable key is meant for browsers; the database's rules do the protecting).
const SUPABASE_URL = process.env.SUPABASE_URL || "https://mrklhkseyynmnjzbiokx.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_8SekgbrdzwUzWaMCohwznQ_wPZaOpDo";

const env = (k, d = "") => (process.env[k] || d).trim();
// brand "ikw" = Campaigns-Dad (I Know Warehouses, HubSpot contacts): CAMPAIGN_* variables.
// brand "awd" = Campaigns-Me (Affordable Web Designs drip emails to CRM leads): the same names with AWD_ in front.
// RESEND_API_KEY is shared (both sending domains are verified in the same Resend account).
const BRANDS = { ikw: { prefix: "", business: "I Know Warehouses" }, awd: { prefix: "AWD_", business: "Affordable Web Designs" } };
const brandOf = (b) => (BRANDS[b] ? b : "ikw");
const settings = (brand = "ikw") => { const p = BRANDS[brandOf(brand)].prefix; return {
  brand: brandOf(brand),
  business: env(p + "CAMPAIGN_BUSINESS_NAME", BRANDS[brandOf(brand)].business),
  from: env(p + "CAMPAIGN_FROM"),                  // e.g. Johnathon Ghormley <john@yourdomain.com> (domain verified in Resend)
  replyTo: env(p + "CAMPAIGN_REPLY_TO"),           // where replies go: your everyday inbox
  address: env(p + "CAMPAIGN_MAILING_ADDRESS"),    // business postal address (required by CAN-SPAM)
  live: env(p + "CAMPAIGNS_LIVE") === "true",      // anything else = dry run only, nothing is sent
  hubspot: !!env("HUBSPOT_TOKEN"),
  resend: !!env("RESEND_API_KEY"),
  webhook: !!env("RESEND_WEBHOOK_SECRET")
}; };

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// The caller must be signed in to the CRM: checks their Supabase session token. Returns the token or null.
async function requireUser(req, res) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (r.ok) return token;
  }
  send(res, 401, { error: "Sign in to the CRM first." });
  return null;
}

// The caller must be a CRM admin (Campaigns-Me / Campaigns-Dad are admin-only; roles.sql). Returns the token or null.
async function requireAdmin(req, res) {
  const token = await requireUser(req, res);
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_crm_admin`, { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
  // Before roles.sql runs the function doesn't exist (404): everyone signed in is treated as before.
  if (r.status === 404 || (r.ok && (await r.json()) === true)) return token;
  send(res, 403, { error: "Campaigns are for admins only." });
  return null;
}

// Supabase REST call. `token` = the signed-in user's session (row rules apply), or null for the public key.
async function db(token, path, { method = "GET", body, prefer } = {}) {
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Database: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function hubspot(path, { method = "GET", body } = {}) {
  const t = env("HUBSPOT_TOKEN");
  if (!t) throw new Error("HUBSPOT_TOKEN isn't set in Vercel yet.");
  const r = await fetch(`https://api.hubapi.com${path}`, {
    method, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  if (!r.ok) { const e = new Error(`HubSpot ${r.status}: ${text.slice(0, 300)}`); e.status = r.status; throw e; }
  return text ? JSON.parse(text) : null;
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString("utf8");
  return s ? JSON.parse(s) : {};
}

const origin = (req) => `${req.headers["x-forwarded-proto"] || "https"}://${req.headers["x-forwarded-host"] || req.headers.host}`;

module.exports = { env, settings, brandOf, send, requireUser, requireAdmin, db, hubspot, readJson, origin, SUPABASE_URL, SUPABASE_ANON_KEY };
