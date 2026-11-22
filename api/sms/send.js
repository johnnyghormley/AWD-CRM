// POST /api/sms/send { lead_id, body }: sends ONE text to ONE lead's owner phone from Johnathon's cell. Admins only.
// The number always comes from the lead record (never from the browser), so a send can only reach that lead.
// No bulk, no scheduling: one call = one text, and only when someone presses Send in the CRM.
const crypto = require("crypto");
const { send, requireAdmin, readJson, db } = require("../_lib");
const sms = require("../_sms");

const MAX = 1000; // characters (the gateway splits anything over 160 into parts)

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  const token = await requireAdmin(req, res);
  if (!token) return;
  if (!sms.has.gateway()) return send(res, 400, { error: "Texting isn't set up yet (SMSGATE_USERNAME / SMSGATE_PASSWORD missing in Vercel).", code: "not_configured" });
  const { lead_id: leadId, body: raw } = await readJson(req).catch(() => ({}));
  const body = String(raw || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(String(leadId || ""))) return send(res, 400, { error: "lead_id is missing" });
  if (!body) return send(res, 400, { error: "Type a message first." });
  if (body.length > MAX) return send(res, 400, { error: `That's too long (${body.length} characters, ${MAX} max).` });

  let lead;
  try { lead = ((await db(token, `leads?id=eq.${leadId}&select=id,business_name,owner_phone`)) || [])[0]; }
  catch (e) { return send(res, 500, { error: e.message }); }
  if (!lead) return send(res, 404, { error: "Lead not found" });
  const phone = sms.e164(lead.owner_phone);
  if (!phone) return send(res, 400, { error: "This lead has no usable owner phone." });
  // They replied STOP: never text them again (unless they reply START).
  try {
    const incoming = await db(token, `sms_messages?lead_id=eq.${lead.id}&direction=eq.in&select=body,created_at&order=created_at.asc&limit=1000`);
    if (sms.optedOut(incoming)) return send(res, 403, { error: "They opted out of texts (replied STOP). Not sent.", code: "opted_out" });
  } catch (e) { return send(res, 500, { error: /sms_messages/.test(e.message) ? "Texts aren't set up in the database yet: run sms.sql in Supabase." : e.message }); }

  // Save it first as pending; our row id doubles as the gateway's message id so status webhooks find the row.
  const id = crypto.randomUUID();
  try { await db(token, "sms_messages", { method: "POST", body: { id, lead_id: lead.id, direction: "out", phone, body, status: "pending", gateway_message_id: id }, prefer: "return=minimal" }); }
  catch (e) { return send(res, 500, { error: /sms_messages/.test(e.message) ? "Texts aren't set up in the database yet: run sms.sql in Supabase." : e.message }); }

  try {
    const r = await sms.gateway("/messages", { method: "POST", body: { id, textMessage: { text: body }, phoneNumbers: [phone], withDeliveryReport: true } });
    const gid = (r && r.id) || id;
    if (gid !== id) await db(token, `sms_messages?id=eq.${id}`, { method: "PATCH", body: { gateway_message_id: gid, updated_at: new Date().toISOString() }, prefer: "return=minimal" });
    await db(token, "activities", { method: "POST", body: { lead_id: lead.id, kind: "Text", note: `Text sent: ${body}` }, prefer: "return=minimal" }).catch(() => {});
    send(res, 200, { ok: true, id, status: "pending" });
  } catch (e) {
    await db(token, `sms_messages?id=eq.${id}`, { method: "PATCH", body: { status: "failed", error: e.message.slice(0, 300), updated_at: new Date().toISOString() }, prefer: "return=minimal" }).catch(() => {});
    send(res, 502, { ok: false, id, error: e.message });
  }
};
