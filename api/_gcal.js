// Google Calendar two-way sync for CRM meetings and call backs (2026-11-24). Files starting with _ aren't routes.
// Johnathon's choice: both ways, live, on Johnny's personal Gmail's main calendar.
//
// Setup Johnathon does himself (nothing secret is in this repo):
//   Google Cloud: a project with the Google Calendar API on, an OAuth consent screen (External, published), and an
//   OAuth client of type "Web application" with redirect URI https://awd-crm.vercel.app/api/gcal/callback
//   Vercel variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_SECRET_KEY (same value as his Windows
//   AWD_SUPABASE_SECRET_KEY). Then run gcal.sql in Supabase and click Connect Google Calendar on the CRM's Team page.
//
// How it stays duplicate-free:
//   CRM → Google: each meeting's Google event id is "crm" + the meeting's uuid without dashes (Google lets the caller pick
//   the id). Creating it twice just hits "already exists", so two syncs at once can't make two events.
//   Google → CRM: events made in Google are saved once per Google event id (unique index google_event_id in gcal.sql);
//   events whose id starts with "crm" are the CRM's own and only update their meeting.
//   A meeting changed in the CRM is marked google_dirty by a database trigger; the next sync pushes it and clears it.
// No attendees are ever added and sendUpdates=none, so Google never emails anyone.
const crypto = require("crypto");
const { env, SUPABASE_URL } = require("./_lib");

const REDIRECT_URI = env("GOOGLE_REDIRECT_URI", "https://awd-crm.vercel.app/api/gcal/callback");
const SCOPES = "openid email https://www.googleapis.com/auth/calendar.events";
const TZ = "America/Chicago";
const CAL = "primary";
const PULL_EVERY_MS = 60 * 1000;        // Google is asked for changes at most once a minute
const PAST_DAYS = 30, FUTURE_DAYS = 400; // Google events this far back / ahead come into the CRM

const cfg = () => ({ clientId: env("GOOGLE_CLIENT_ID"), secret: env("GOOGLE_CLIENT_SECRET"), dbKey: env("SUPABASE_SECRET_KEY") });
const missing = () => { const c = cfg(); return [["GOOGLE_CLIENT_ID", c.clientId], ["GOOGLE_CLIENT_SECRET", c.secret], ["SUPABASE_SECRET_KEY", c.dbKey]].filter(([, v]) => !v).map(([k]) => k); };

// ---- crypto: refresh token encrypted at rest; OAuth state signed ----
const keyFor = (purpose) => crypto.createHash("sha256").update(`awd-gcal:${purpose}:${cfg().secret}`).digest();
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
    if (/gcal_connection|google_event_id|google_dirty|google_synced_at|google_error/.test(text) && /(does not exist|Could not find|schema cache)/i.test(text)) {
      const e = new Error("Google Calendar isn't set up in the database yet: run gcal.sql in Supabase."); e.code = "no_table"; throw e;
    }
    throw new Error(`Database: ${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : null;
}
const getConnection = async () => ((await sdb("gcal_connection?id=eq.1&select=*")) || [])[0] || null;
const saveConnection = (patch) => sdb("gcal_connection?on_conflict=id", { method: "POST", body: { id: 1, updated_at: new Date().toISOString(), ...patch }, prefer: "resolution=merge-duplicates,return=minimal" });

// ---- Google sign-in ----
function authorizeUrl(state) {
  const q = new URLSearchParams({ client_id: cfg().clientId, redirect_uri: REDIRECT_URI, response_type: "code", scope: SCOPES,
    access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true", state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
async function tokenCall(params) {
  const c = cfg();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.secret, ...params }).toString()
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    const e = new Error(`Google sign-in: ${j.error_description || j.error || r.status}`);
    if (j.error === "invalid_grant") e.code = "not_connected"; // revoked or expired: connect again
    throw e;
  }
  return j;
}
// Email of the signed-in Google account, from the id_token Google returned straight to us over HTTPS.
function emailFromIdToken(idToken) {
  try { return JSON.parse(Buffer.from(String(idToken).split(".")[1], "base64url").toString("utf8")).email || null; } catch { return null; }
}
async function accessToken(conn) {
  if (!conn || !conn.refresh_token_enc) { const e = new Error("Google Calendar isn't connected."); e.code = "not_connected"; throw e; }
  let refresh;
  try { refresh = decrypt(conn.refresh_token_enc); } catch { const e = new Error("Google Calendar needs to be connected again."); e.code = "not_connected"; throw e; }
  return (await tokenCall({ grant_type: "refresh_token", refresh_token: refresh })).access_token;
}
async function gapi(at, path, { method = "GET", body } = {}) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method, headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  if (!r.ok) { let m = text; try { m = JSON.parse(text).error.message; } catch {} const e = new Error(`Google ${r.status}: ${String(m).slice(0, 200)}`); e.status = r.status; throw e; }
  return text ? JSON.parse(text) : null;
}

// ---- mapping ----
const crmEventId = (meetingId) => "crm" + String(meetingId).replace(/-/g, "").toLowerCase();
function meetingIdFromEvent(ev) {
  const base = String(ev.recurringEventId || ev.id || "");
  const m = /^crm([0-9a-f]{32})$/.exec(base);
  if (!m) return null;
  const h = m[1];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
// Midnight in Houston on a "YYYY-MM-DD" day, as a Date (for all-day Google events).
function chicagoMidnight(day) {
  const guess = new Date(`${day}T06:00:00Z`); // CST midnight; corrected below for CDT
  const h = +new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(guess);
  return new Date(guess.getTime() - h * 3600000);
}
const chicagoDay = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(date));
// { starts_at, duration_min } of a Google event. All-day events start at midnight Houston time with duration 1440 × days.
function eventTimes(ev) {
  if (ev.start && ev.start.date) {
    const a = chicagoMidnight(ev.start.date), b = chicagoMidnight(ev.end && ev.end.date ? ev.end.date : ev.start.date);
    return { starts_at: a.toISOString(), duration_min: Math.max(1440, Math.round((b - a) / 60000 / 1440) * 1440), all_day: true };
  }
  const a = new Date(ev.start.dateTime), b = new Date(ev.end && ev.end.dateTime ? ev.end.dateTime : a.getTime() + 30 * 60000);
  return { starts_at: a.toISOString(), duration_min: Math.max(5, Math.round((b - a) / 60000)), all_day: false };
}
const sameTime = (m, t) => new Date(m.starts_at).getTime() === new Date(t.starts_at).getTime() && (m.duration_min || 30) === t.duration_min;

function eventTimeBody(m) {
  const a = new Date(m.starts_at);
  if ((m.duration_min || 0) >= 1440 && m.kind === "Google") { // all-day event from Google stays all-day
    const days = Math.round(m.duration_min / 1440), end = new Date(a.getTime() + days * 86400000 + 12 * 3600000);
    return { start: { date: chicagoDay(a) }, end: { date: chicagoDay(end) } };
  }
  const b = new Date(a.getTime() + (m.duration_min || 30) * 60000);
  return { start: { dateTime: a.toISOString(), timeZone: TZ }, end: { dateTime: b.toISOString(), timeZone: TZ } };
}
function eventBody(m, crmOrigin) {
  const l = m.leads || {};
  const who = l.business_name || "Lead";
  const phone = l.owner_phone || l.business_phone;
  const summary = m.kind === "Callback" ? `☎️ Call back: ${who}` : `AWD: ${m.kind} with ${who}`;
  const description = [m.kind === "Callback" ? "Call back" : `${m.kind}, ${m.duration_min || 30} min`, l.owner_name && `Owner: ${l.owner_name}`,
    phone && `Phone: ${phone}`, m.note, m.meeting_url && `Join: ${m.meeting_url}`, m.lead_id && `CRM: ${crmOrigin}/#/lead/${m.lead_id}`].filter(Boolean).join("\n");
  return { summary, description, location: m.location || "", ...eventTimeBody(m) };
}

// Finds the lead a Google-made event is about: its business name in the title, or its phone number anywhere in it.
function matchLead(ev, leads) {
  const text = `${ev.summary || ""} ${ev.description || ""} ${ev.location || ""}`;
  const lower = (ev.summary || "").toLowerCase(), digits = text.replace(/\D/g, "");
  for (const l of leads) {
    for (const p of [l.owner_phone, l.business_phone]) {
      const d = String(p || "").replace(/\D/g, "").slice(-10);
      if (d.length === 10 && digits.includes(d)) return l.id;
    }
  }
  let best = null;
  for (const l of leads) {
    const n = String(l.business_name || "").trim().toLowerCase();
    if (n.length >= 5 && lower.includes(n) && (!best || n.length > best.n.length)) best = { id: l.id, n };
  }
  return best ? best.id : null;
}

module.exports = { REDIRECT_URI, SCOPES, TZ, CAL, PULL_EVERY_MS, PAST_DAYS, FUTURE_DAYS, cfg, missing, encrypt, decrypt, makeState, readState,
  sdb, getConnection, saveConnection, authorizeUrl, tokenCall, emailFromIdToken, accessToken, gapi,
  crmEventId, meetingIdFromEvent, eventTimes, sameTime, eventTimeBody, eventBody, matchLead, chicagoMidnight };
