// Sends (or dry-runs) the next part of today's batch for one campaign. Signed-in CRM users only.
// POST /api/campaign-send { campaign_id, dry_run }
// - Daily cap counts every campaign together, by Houston (America/Chicago) date.
// - Emails go through Resend, scheduled `spacing_min` minutes apart, a few per call (the CRM calls repeatedly).
// - Unsubscribed / bounced addresses are skipped. Each sent email is logged on the HubSpot contact.
// - Nothing is sent unless CAMPAIGNS_LIVE=true in Vercel; otherwise it's always a dry run.
const { settings, send, requireUser, db, hubspot, readJson, origin, env } = require("./_lib");
const { render } = require("../campaign-render.js");

const PER_CALL = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Midnight today in Houston, as an ISO time.
function houstonMidnight(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    .formatToParts(now).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  const offset = asUtc - Math.floor(now.getTime() / 1000) * 1000; // Houston local minus UTC
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset).toISOString();
}

async function resendSend(msg) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify(msg)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend ${r.status}: ${j.message || JSON.stringify(j).slice(0, 200)}`);
  return j.id;
}

// Log the email on the HubSpot contact's timeline (email engagement; falls back to a note).
async function logToHubspot(row, mail, at) {
  if (!row.contact_id) return;
  const assoc = (typeId) => [{ to: { id: row.contact_id }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: typeId }] }];
  try {
    await hubspot("/crm/v3/objects/emails", { method: "POST", body: { associations: assoc(198), properties: {
      hs_timestamp: at, hs_email_direction: "EMAIL", hs_email_status: "SENT", hs_email_subject: mail.subject, hs_email_text: mail.text,
      hs_email_to_email: row.email } } });
  } catch (e) {
    await hubspot("/crm/v3/objects/notes", { method: "POST", body: { associations: assoc(202), properties: {
      hs_timestamp: at, hs_note_body: `Campaign email scheduled to ${row.email} for ${at}\nSubject: ${mail.subject}\n\n${mail.text}` } } });
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  const token = await requireUser(req, res);
  if (!token) return;
  try {
    const { campaign_id, dry_run } = await readJson(req);
    const s = settings();
    const live = s.live && !dry_run;
    if (live && (!s.resend || !s.from || !s.address)) return send(res, 400, { error: "Set RESEND_API_KEY, CAMPAIGN_FROM and CAMPAIGN_MAILING_ADDRESS in Vercel before sending." });

    const [c] = await db(token, `campaigns?id=eq.${encodeURIComponent(campaign_id)}&select=*`);
    if (!c) return send(res, 404, { error: "Campaign not found" });
    const midnight = houstonMidnight();
    const today = await db(token, `campaign_sends?select=sent_at&sent_at=gte.${encodeURIComponent(midnight)}&status=in.(scheduled,sent,bounced)&order=sent_at.desc`);
    const remaining = Math.max(0, (c.daily_cap || 40) - today.length);
    const queuedLeft = (await db(token, `campaign_sends?select=id&campaign_id=eq.${c.id}&status=eq.queued`)).length;
    const base = { live, daily_cap: c.daily_cap, sent_today: today.length, queued_left: queuedLeft };
    if (!remaining || !queuedLeft) return send(res, 200, { ...base, results: [], remaining_today: remaining, done: !queuedLeft });

    // Live: a few per call (the CRM calls again). Dry run: the whole day at once. Skipped addresses don't use up the cap.
    const take = live ? PER_CALL : queuedLeft;
    let used = 0;
    const rows = await db(token, `campaign_sends?select=*&campaign_id=eq.${c.id}&status=eq.queued&order=created_at.asc&limit=${take}`);
    const unsub = new Set((await db(token, "email_unsubscribes?select=email")).map((u) => u.email));
    // First slot: a minute from now, or `spacing_min` after the last email already scheduled today.
    const spacing = (c.spacing_min || 8) * 60000;
    let slot = Math.max(Date.now() + 60000, today.length ? new Date(today[0].sent_at).getTime() + spacing : 0);
    const results = [];
    for (const row of rows) {
      if (used >= remaining) break;
      if (unsub.has(row.email.toLowerCase())) {
        if (live) await db(token, `campaign_sends?id=eq.${row.id}`, { method: "PATCH", body: { status: "skipped", error: "Unsubscribed or bounced earlier" } });
        results.push({ email: row.email, skipped: "Unsubscribed or bounced earlier" });
        continue;
      }
      const at = new Date(slot).toISOString();
      const mail = render(c, row, { business: s.business, address: s.address || "[mailing address not set]", unsubUrl: `${origin(req)}/api/unsubscribe?t=${row.unsub_token}` });
      if (!live) { results.push({ email: row.email, at, ...mail }); slot += spacing; used++; continue; }
      try {
        const id = await resendSend({ from: s.from, to: [row.email], reply_to: s.replyTo || undefined, subject: mail.subject, html: mail.html, text: mail.text, scheduled_at: at,
          headers: { "List-Unsubscribe": `<${origin(req)}/api/unsubscribe?t=${row.unsub_token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
        await db(token, `campaign_sends?id=eq.${row.id}`, { method: "PATCH", body: { status: "scheduled", resend_id: id, sent_at: at, error: null } });
        try { await logToHubspot(row, mail, at); } catch (e) {
          await db(token, `campaign_sends?id=eq.${row.id}`, { method: "PATCH", body: { error: `Not logged in HubSpot: ${e.message}`.slice(0, 300) } });
        }
        results.push({ email: row.email, at, subject: mail.subject, sent: true });
        slot += spacing; used++;
      } catch (e) {
        await db(token, `campaign_sends?id=eq.${row.id}`, { method: "PATCH", body: { status: "failed", error: e.message.slice(0, 300) } });
        results.push({ email: row.email, error: e.message });
      }
      await sleep(550); // Resend allows 2 requests a second
    }
    if (live) {
      const left = (await db(token, `campaign_sends?select=id&campaign_id=eq.${c.id}&status=eq.queued`)).length;
      await db(token, `campaigns?id=eq.${c.id}`, { method: "PATCH", body: { status: left ? "sending" : "done" } });
      base.queued_left = left;
    }
    send(res, 200, { ...base, results, remaining_today: remaining - used, done: !base.queued_left });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
};

module.exports.houstonMidnight = houstonMidnight;
