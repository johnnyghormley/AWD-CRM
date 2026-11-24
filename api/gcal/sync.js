// POST /api/gcal/sync (any signed-in CRM user) or GET /api/gcal/sync (Vercel's daily cron; anyone, answers only ok/not).
// One run does both directions for Johnny's Google Calendar (see api/_gcal.js for how duplicates are avoided):
//   1) CRM → Google: every meeting or call back marked google_dirty (booked, moved, done, canceled or edited in the CRM)
//      is created, updated or deleted in Google. Canceled = deleted from Google.
//   2) Google → CRM (at most once a minute, unless { force: true }): Google events changed since the last run.
//      The CRM's own events update their meeting (moved or deleted in Google). Events made in Google become meetings
//      of kind "Google", attached to a lead when the title names the business or the event has its phone number;
//      otherwise lead_id stays empty and only admins can see them (gcal.sql row rule).
const { send, requireUser, readJson, origin } = require("../_lib");
const g = require("../_gcal");

const PUSH_LIMIT = 25, MAX_PAGES = 6;
const SKIP_TYPES = new Set(["workingLocation", "birthday", "focusTime"]);
const enc = encodeURIComponent;

async function getAll(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await g.sdb(`${path}&limit=1000&offset=${from}`);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
const note = (lead_id, text) => lead_id ? g.sdb("activities", { method: "POST", body: { lead_id, kind: "Note", note: text }, prefer: "return=minimal" }).catch(() => {}) : null;
const fmt = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: g.TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
// Every server write to a meeting sets google_synced_at, which tells the trigger it came from the sync (stays clean).
const saveMeeting = (id, patch) => g.sdb(`meetings?id=eq.${id}`, { method: "PATCH", body: { google_dirty: false, google_synced_at: new Date().toISOString(), ...patch }, prefer: "return=minimal" });

async function push(at, crmOrigin, out) {
  const rows = await g.sdb(`meetings?google_dirty=eq.true&select=*,leads(business_name,owner_name,owner_phone,business_phone)&order=starts_at.desc&limit=${PUSH_LIMIT}`);
  const oldest = Date.now() - g.PAST_DAYS * 86400000;
  for (const m of rows) {
    try {
      const eid = m.google_event_id || g.crmEventId(m.id);
      // Old meetings that never reached Google aren't back-filled.
      if (!m.google_event_id && new Date(m.starts_at).getTime() < oldest) { await saveMeeting(m.id, { google_error: null }); continue; }
      if (m.status === "canceled") {
        if (m.google_event_id) await g.gapi(at, `/calendars/${g.CAL}/events/${enc(eid)}?sendUpdates=none`, { method: "DELETE" }).catch((e) => { if (![404, 410].includes(e.status)) throw e; });
        await saveMeeting(m.id, { google_error: null });
        out.pushed++; continue;
      }
      if (m.kind === "Google") { // made in Google: only its time is sent back (title and notes stay Johnny's)
        try { await g.gapi(at, `/calendars/${g.CAL}/events/${enc(eid)}?sendUpdates=none`, { method: "PATCH", body: { ...g.eventTimeBody(m), status: "confirmed" } }); }
        catch (e) { // gone from Google: nothing left to update
          if (![404, 410].includes(e.status)) throw e;
          await saveMeeting(m.id, { status: m.status === "scheduled" ? "canceled" : m.status, google_error: null }); continue;
        }
      } else {
        const body = g.eventBody(m, crmOrigin);
        let done = false;
        if (m.google_event_id) {
          try { await g.gapi(at, `/calendars/${g.CAL}/events/${enc(eid)}?sendUpdates=none`, { method: "PATCH", body: { ...body, status: "confirmed" } }); done = true; }
          catch (e) { if (![404, 410].includes(e.status)) throw e; }
        }
        if (!done) {
          try { await g.gapi(at, `/calendars/${g.CAL}/events?sendUpdates=none`, { method: "POST", body: { id: eid, ...body } }); }
          catch (e) { // already exists (another sync made it, or it was deleted in Google and is being restored): update it
            if (e.status !== 409) throw e;
            await g.gapi(at, `/calendars/${g.CAL}/events/${enc(eid)}?sendUpdates=none`, { method: "PATCH", body: { ...body, status: "confirmed" } });
          }
        }
      }
      await saveMeeting(m.id, { google_event_id: eid, google_error: null });
      out.pushed++;
    } catch (e) {
      out.errors.push(e.message);
      await g.sdb(`meetings?id=eq.${m.id}`, { method: "PATCH", body: { google_synced_at: new Date().toISOString(), google_error: e.message.slice(0, 300) }, prefer: "return=minimal" }).catch(() => {});
    }
  }
}

async function pull(at, conn, out) {
  const startedAt = new Date();
  // Claim this run (another sync running at the same moment skips its pull).
  const claim = await g.sdb(`gcal_connection?id=eq.1&${conn.last_pull_at ? `last_pull_at=eq.${enc(conn.last_pull_at)}` : "last_pull_at=is.null"}`,
    { method: "PATCH", body: { last_pull_at: startedAt.toISOString() }, prefer: "return=representation" });
  if (!claim || !claim.length) return;
  try {
    const q = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "250",
      timeMin: new Date(Date.now() - g.PAST_DAYS * 86400000).toISOString(), timeMax: new Date(Date.now() + g.FUTURE_DAYS * 86400000).toISOString() });
    if (conn.last_pull_at) q.set("updatedMin", new Date(new Date(conn.last_pull_at).getTime() - 2 * 60000).toISOString());
    const events = [];
    let pageToken = null, pages = 0;
    do {
      if (pageToken) q.set("pageToken", pageToken);
      const r = await g.gapi(at, `/calendars/${g.CAL}/events?${q}`);
      events.push(...(r.items || []));
      pageToken = r.nextPageToken; pages++;
    } while (pageToken && pages < MAX_PAGES);
    if (pageToken) throw Object.assign(new Error("Too many Google changes for one run; the rest come next run."), { partial: true });
    if (!events.length) return;

    const crmIds = [...new Set(events.map(g.meetingIdFromEvent).filter(Boolean))];
    const gIds = [...new Set(events.filter((e) => !g.meetingIdFromEvent(e)).map((e) => e.id))];
    const byId = new Map(), byGid = new Map();
    for (let i = 0; i < crmIds.length; i += 100)
      (await g.sdb(`meetings?id=in.(${crmIds.slice(i, i + 100).join(",")})&select=*`)).forEach((m) => byId.set(m.id, m));
    for (let i = 0; i < gIds.length; i += 50)
      (await g.sdb(`meetings?google_event_id=in.(${gIds.slice(i, i + 50).map((x) => `"${x}"`).join(",")})&select=*`)).forEach((m) => byGid.set(m.google_event_id, m));
    let leads = null;
    const findLead = async (ev) => { if (!leads) leads = await getAll("leads?select=id,business_name,owner_phone,business_phone&order=id"); return g.matchLead(ev, leads); };

    for (const ev of events) {
      try {
        if (SKIP_TYPES.has(ev.eventType)) continue;
        const declined = (ev.attendees || []).some((a) => a.self && a.responseStatus === "declined");
        const gone = ev.status === "cancelled" || declined;
        const mid = g.meetingIdFromEvent(ev);
        if (mid) { // the CRM's own event
          const m = byId.get(mid);
          if (!m) { // its meeting was deleted with its lead: take it off Google too
            if (!gone && ev.id === g.crmEventId(mid)) await g.gapi(at, `/calendars/${g.CAL}/events/${enc(ev.id)}?sendUpdates=none`, { method: "DELETE" }).catch(() => {});
            continue;
          }
          if (m.google_dirty || m.status === "canceled") continue; // a CRM change waiting to go out wins
          if (gone) {
            if (m.status === "scheduled") { await saveMeeting(m.id, { status: "canceled", google_event_id: null }); await note(m.lead_id, `${m.kind === "Callback" ? "Callback" : "Meeting"} canceled in Google Calendar: ${fmt(m.starts_at)}`); out.pulled++; }
            continue;
          }
          const t = g.eventTimes(ev);
          if (!sameTimeOk(m, t)) { await saveMeeting(m.id, { starts_at: t.starts_at, duration_min: t.duration_min }); await note(m.lead_id, `${m.kind === "Callback" ? "Callback" : "Meeting"} moved in Google Calendar: ${fmt(m.starts_at)} → ${fmt(t.starts_at)}`); out.pulled++; }
          continue;
        }
        // made in Google
        const m = byGid.get(ev.id);
        if (gone) {
          if (m && m.status === "scheduled" && !m.google_dirty) { await saveMeeting(m.id, { status: "canceled" }); await note(m.lead_id, `Meeting canceled in Google Calendar: ${fmt(m.starts_at)}`); out.pulled++; }
          continue;
        }
        if (!ev.start) continue;
        const t = g.eventTimes(ev);
        const fields = { starts_at: t.starts_at, duration_min: t.duration_min, note: (ev.summary || "(no title)").slice(0, 500), location: ev.location ? ev.location.slice(0, 500) : null };
        if (!m) {
          const lead_id = await findLead(ev);
          const ins = await g.sdb("meetings?on_conflict=google_event_id", { method: "POST", prefer: "resolution=ignore-duplicates,return=representation",
            body: { ...fields, lead_id, kind: "Google", status: "scheduled", google_event_id: ev.id, google_dirty: false, google_synced_at: new Date().toISOString() } });
          if (ins && ins.length) { await note(lead_id, `Meeting added from Google Calendar: ${fmt(t.starts_at)}, “${fields.note}”`); out.pulled++; }
        } else if (!m.google_dirty && (!sameTimeOk(m, t) || m.note !== fields.note || (m.location || null) !== fields.location || m.status === "canceled")) {
          await saveMeeting(m.id, { ...fields, status: m.status === "canceled" ? "scheduled" : m.status }); out.pulled++;
        }
      } catch (e) { out.errors.push(e.message); }
    }
  } catch (e) {
    if (!e.partial) { // let the next run fetch the same window again
      await g.sdb("gcal_connection?id=eq.1", { method: "PATCH", body: { last_pull_at: conn.last_pull_at || null }, prefer: "return=minimal" }).catch(() => {});
    }
    throw e;
  }
}
const sameTimeOk = (m, t) => g.sameTime(m, t);

module.exports = async (req, res) => {
  const isCron = req.method === "GET";
  if (!isCron && req.method !== "POST") return send(res, 405, { error: "GET or POST only" });
  if (!isCron && !(await requireUser(req, res))) return;
  const body = isCron ? {} : await readJson(req).catch(() => ({}));
  if (g.missing().length) return send(res, 200, { ok: false, connected: false, error: "Google Calendar isn't set up yet." });
  const out = { ok: true, connected: true, pushed: 0, pulled: 0, errors: [] };
  try {
    const conn = await g.getConnection();
    if (!conn) return send(res, 200, { ok: false, connected: false });
    const dirty = await g.sdb("meetings?google_dirty=eq.true&select=id&limit=1");
    const pullDue = body.force || isCron || !conn.last_pull_at || Date.now() - new Date(conn.last_pull_at).getTime() > g.PULL_EVERY_MS;
    if (!dirty.length && !pullDue) return send(res, 200, out);
    const at = await g.accessToken(conn);
    if (dirty.length) await push(at, origin(req), out);
    if (pullDue) await pull(at, conn, out);
    await g.saveConnection({ last_sync_at: new Date().toISOString(), last_error: out.errors[0] || null }).catch(() => {});
  } catch (e) {
    out.ok = false; out.error = e.message; out.code = e.code;
    await g.saveConnection({ last_error: e.message.slice(0, 300) }).catch(() => {});
  }
  if (isCron) return send(res, 200, { ok: out.ok });
  send(res, 200, out);
};
