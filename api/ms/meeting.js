// POST /api/ms/meeting { meeting_id, action: "sync" | "delete" }: any signed-in CRM user.
// sync   = create the Outlook event with a Teams link on the connected AWD Microsoft account, or move it if it exists.
// delete = remove the Outlook event (meeting canceled, or the lead deleted).
// No attendees are ever added, so Microsoft sends no invite or email to anyone; Johnathon sends the link himself.
// The meeting is always saved in the CRM first; this only adds the link. A failure is saved as teams_error
// so the lead page can show "Teams link not created" with a Retry button.
const { send, requireUser, readJson, db } = require("../_lib");
const ms = require("../_ms");

const ONLINE = (m) => m.kind !== "In person"; // in-person meetings get the calendar event without a Teams link

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  const token = await requireUser(req, res);
  if (!token) return;
  const { meeting_id: id, action = "sync" } = await readJson(req).catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) return send(res, 400, { error: "meeting_id is missing" });

  // Read and update the meeting as the signed-in user (normal CRM row rules).
  let m;
  try { m = ((await db(token, `meetings?id=eq.${id}&select=*,leads(id,business_name,owner_name,owner_phone,business_phone)`)) || [])[0]; }
  catch (e) { return send(res, 500, { error: e.message }); }
  if (!m) return send(res, 404, { error: "Meeting not found" });
  if (m.kind === "Callback") return send(res, 200, { ok: true, skipped: "callback" });
  if (!("teams_join_url" in m)) return send(res, 200, { ok: false, error: "Microsoft Teams isn't set up in the database yet: run teams.sql in Supabase." });
  const save = (patch) => db(token, `meetings?id=eq.${id}`, { method: "PATCH", body: patch, prefer: "return=minimal" });

  const need = ms.missing();
  if (need.length) {
    const error = "Microsoft isn't set up yet.";
    if (action === "sync") await save({ teams_error: error }).catch(() => {});
    return send(res, 200, { ok: false, error, code: "not_configured" });
  }
  try {
    const at = await ms.accessToken();
    if (action === "delete") {
      if (m.ms_event_id) await ms.graph(at, `/me/events/${encodeURIComponent(m.ms_event_id)}`, { method: "DELETE" }).catch((e) => { if (e.status !== 404) throw e; });
      await save({ ms_event_id: null, teams_error: null });
      return send(res, 200, { ok: true });
    }
    const l = m.leads || {};
    const start = new Date(m.starts_at), end = new Date(start.getTime() + (m.duration_min || 30) * 60000);
    const crm = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers["x-forwarded-host"] || req.headers.host}/#/lead/${m.lead_id}`;
    const event = {
      subject: `AWD – ${l.business_name || "Meeting"}`,
      start: { dateTime: ms.chicagoLocal(start), timeZone: ms.TZ },
      end: { dateTime: ms.chicagoLocal(end), timeZone: ms.TZ },
      location: { displayName: m.location || "" },
      body: { contentType: "text", content: [`${m.kind}, ${m.duration_min || 30} min`, l.owner_name && `Owner: ${l.owner_name}`, (l.owner_phone || l.business_phone) && `Phone: ${l.owner_phone || l.business_phone}`, m.note, `CRM: ${crm}`].filter(Boolean).join("\n") }
    };
    let ev;
    if (m.ms_event_id) {
      try { ev = await ms.graph(at, `/me/events/${encodeURIComponent(m.ms_event_id)}`, { method: "PATCH", body: event }); }
      catch (e) { if (e.status !== 404) throw e; } // deleted in Outlook: make a new one below
    }
    if (!ev) ev = await ms.graph(at, "/me/events", { method: "POST", body: { ...event, attendees: [], isReminderOn: true, reminderMinutesBeforeStart: 15,
      ...(ONLINE(m) ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" } : {}) } });
    let joinUrl = ev.onlineMeeting && ev.onlineMeeting.joinUrl;
    if (ONLINE(m) && !joinUrl) { // Microsoft sometimes fills the link in a moment later
      const again = await ms.graph(at, `/me/events/${encodeURIComponent(ev.id)}?$select=onlineMeeting`).catch(() => null);
      joinUrl = again && again.onlineMeeting && again.onlineMeeting.joinUrl;
    }
    const patch = { ms_event_id: ev.id, teams_join_url: joinUrl || null, teams_error: ONLINE(m) && !joinUrl ? "Microsoft made the calendar event but no Teams link (is Teams on for this account?)" : null };
    await save(patch);
    send(res, 200, { ok: !patch.teams_error, ...patch, error: patch.teams_error || undefined });
  } catch (e) {
    const error = e.code === "not_connected" ? e.message : `Teams link not created: ${e.message}`;
    if (action === "sync") await save({ teams_error: error.slice(0, 300) }).catch(() => {});
    send(res, 200, { ok: false, error, code: e.code || "graph_error" });
  }
};
