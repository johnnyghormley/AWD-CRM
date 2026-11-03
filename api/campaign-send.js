// Sends (or dry-runs) the next part of today's batch for one campaign. Signed-in CRM users only.
// POST /api/campaign-send { campaign_id, dry_run }
// - Daily cap counts every campaign together, by Houston (America/Chicago) date.
// - Emails go through Resend, scheduled `spacing_min` minutes apart, a few per call (the CRM calls repeatedly).
// - Unsubscribed / bounced addresses are skipped. Each sent email is logged on the HubSpot contact (Campaigns-Dad)
//   or on the CRM lead's timeline (Campaigns-Me).
// - Campaigns-Me drips: once an email's delay has passed since the previous one, the next email is queued for that
//   person, unless they replied, unsubscribed, bounced, or their lead is Won / Not Interested / Do Not Call / Disqualified.
// - Nothing is sent unless CAMPAIGNS_LIVE=true (Campaigns-Dad) / AWD_CAMPAIGNS_LIVE=true (Campaigns-Me) in Vercel.
const { settings, send, requireUser, db, hubspot, readJson, origin, env } = require("./_lib");
const { render } = require("../campaign-render.js");

const PER_CALL = 5;
const DAY = 86400000;
const STOP_STATUSES = ["Won", "Not Interested", "Do Not Call", "Disqualified"];
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

// Campaigns-Me: the next drip email for everyone whose previous one went out at least its delay_days ago.
// Live: saves them as queued rows and returns them. Dry run: returns unsaved preview rows.
async function dueDripRows(token, c, live) {
  const steps = Array.isArray(c.steps) ? c.steps : [];
  if (!steps.length) return [];
  const rows = await db(token, `campaign_sends?select=*&campaign_id=eq.${c.id}&order=step.asc`);
  const byEmail = {};
  rows.forEach((r) => { (byEmail[r.email.toLowerCase()] = byEmail[r.email.toLowerCase()] || []).push(r); });
  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))];
  const leads = leadIds.length ? await db(token, `leads?select=id,call_status&id=in.(${leadIds.join(",")})`) : [];
  const stopped = new Set(leads.filter((l) => STOP_STATUSES.includes(l.call_status)).map((l) => l.id));
  const add = [];
  for (const list of Object.values(byEmail)) {
    const last = list[list.length - 1];
    if (last.step > steps.length) continue;                      // already got every email
    if (list.some((r) => r.replied_at || r.unsubscribed_at || r.bounced_at)) continue;
    if (last.lead_id && stopped.has(last.lead_id)) continue;
    if (!last.sent_at || !["scheduled", "sent"].includes(last.status)) continue;
    const next = steps[last.step - 1];                           // steps[0] is email 2
    if (Date.now() - new Date(last.sent_at).getTime() < (Number(next.delay_days) || 0) * DAY) continue;
    add.push({ campaign_id: c.id, step: last.step + 1, lead_id: last.lead_id, contact_id: last.contact_id, email: last.email,
      firstname: last.firstname, lastname: last.lastname, company: last.company, city: last.city, jobtitle: last.jobtitle });
  }
  if (!add.length) return [];
  if (live) return db(token, "campaign_sends?on_conflict=campaign_id,email,step", { method: "POST", body: add, prefer: "return=representation,resolution=ignore-duplicates" });
  return add.map((r) => ({ ...r, id: null, status: "queued", unsub_token: "preview" }));
}

// True while someone in the drip still has an email to come (not finished, replied, unsubscribed, bounced or stopped).
async function dripOpen(token, c) {
  const rows = await db(token, `campaign_sends?select=email,step,status,lead_id,replied_at,unsubscribed_at,bounced_at&campaign_id=eq.${c.id}&order=step.asc`);
  const byEmail = {};
  rows.forEach((r) => { (byEmail[r.email.toLowerCase()] = byEmail[r.email.toLowerCase()] || []).push(r); });
  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))];
  const leads = leadIds.length ? await db(token, `leads?select=id,call_status&id=in.(${leadIds.join(",")})`) : [];
  const stopped = new Set(leads.filter((l) => STOP_STATUSES.includes(l.call_status)).map((l) => l.id));
  return Object.values(byEmail).some((list) => {
    const last = list[list.length - 1];
    return last.step <= c.steps.length && ["scheduled", "sent"].includes(last.status) && !(last.lead_id && stopped.has(last.lead_id))
      && !list.some((r) => r.replied_at || r.unsubscribed_at || r.bounced_at);
  });
}

// The subject/body for a send row: email 1 is the campaign itself, later ones come from its steps.
const mailFor = (c, row) => (row.step || 1) > 1 ? (c.steps || [])[row.step - 2] || c : c;

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
    const [c] = await db(token, `campaigns?id=eq.${encodeURIComponent(campaign_id)}&select=*`);
    if (!c) return send(res, 404, { error: "Campaign not found" });
    const awd = c.brand === "awd", P = awd ? "AWD_" : "";
    const s = settings(c.brand);
    const live = s.live && !dry_run;
    if (live && (!s.resend || !s.from || !s.address)) return send(res, 400, { error: `Set RESEND_API_KEY, ${P}CAMPAIGN_FROM and ${P}CAMPAIGN_MAILING_ADDRESS in Vercel before sending.` });

    const drip = awd ? await dueDripRows(token, c, live) : [];
    const midnight = houstonMidnight();
    const today = await db(token, `campaign_sends?select=sent_at&sent_at=gte.${encodeURIComponent(midnight)}&status=in.(scheduled,sent,bounced)&order=sent_at.desc`);
    const remaining = Math.max(0, (c.daily_cap || 40) - today.length);
    const queuedLeft = (await db(token, `campaign_sends?select=id&campaign_id=eq.${c.id}&status=eq.queued`)).length + (live ? 0 : drip.length);
    const base = { live, daily_cap: c.daily_cap, sent_today: today.length, queued_left: queuedLeft };
    if (!remaining || !queuedLeft) return send(res, 200, { ...base, results: [], remaining_today: remaining, done: !queuedLeft });

    // Live: a few per call (the CRM calls again). Dry run: the whole day at once. Skipped addresses don't use up the cap.
    // Follow-up drip emails go before new first emails, so people already in a drip keep getting it on time.
    const take = live ? PER_CALL : queuedLeft;
    let used = 0;
    const saved = await db(token, `campaign_sends?select=*&campaign_id=eq.${c.id}&status=eq.queued&order=step.desc,created_at.asc&limit=${take}`);
    const rows = live ? saved : drip.concat(saved);
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
      const unsubUrl = `${origin(req)}/api/unsubscribe?t=${row.unsub_token}${awd ? "&b=awd" : ""}`;
      const mail = render(mailFor(c, row), row, { business: s.business, address: s.address || "[mailing address not set]", unsubUrl });
      if (!live) { results.push({ email: row.email, at, step: row.step || 1, ...mail }); slot += spacing; used++; continue; }
      try {
        const id = await resendSend({ from: s.from, to: [row.email], reply_to: s.replyTo || undefined, subject: mail.subject, html: mail.html, text: mail.text, scheduled_at: at,
          headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
        await db(token, `campaign_sends?id=eq.${row.id}`, { method: "PATCH", body: { status: "scheduled", resend_id: id, sent_at: at, error: null } });
        try {
          if (!awd) await logToHubspot(row, mail, at);
          else if (row.lead_id) await db(token, "activities", { method: "POST", body: { lead_id: row.lead_id, kind: "Email", note: `Drip email ${row.step || 1} of "${c.name}" scheduled for ${at}: ${mail.subject}` } });
        } catch (e) {
          await db(token, `campaign_sends?id=eq.${row.id}`, { method: "PATCH", body: { error: `Not logged in ${awd ? "the CRM" : "HubSpot"}: ${e.message}`.slice(0, 300) } });
        }
        results.push({ email: row.email, at, step: row.step || 1, subject: mail.subject, sent: true });
        slot += spacing; used++;
      } catch (e) {
        await db(token, `campaign_sends?id=eq.${row.id}`, { method: "PATCH", body: { status: "failed", error: e.message.slice(0, 300) } });
        results.push({ email: row.email, error: e.message });
      }
      await sleep(550); // Resend allows 2 requests a second
    }
    if (live) {
      const left = (await db(token, `campaign_sends?select=id&campaign_id=eq.${c.id}&status=eq.queued`)).length;
      // A drip with emails still to come for someone stays "sending" until they've had them all or stopped.
      const open = awd && (c.steps || []).length ? await dripOpen(token, c) : false;
      await db(token, `campaigns?id=eq.${c.id}`, { method: "PATCH", body: { status: left || open ? "sending" : "done" } });
      base.queued_left = left;
    }
    send(res, 200, { ...base, results, remaining_today: remaining - used, done: !base.queued_left });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
};

module.exports.houstonMidnight = houstonMidnight;
