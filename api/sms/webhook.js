// POST /api/sms/webhook: the text gateway calls this for sms:received, sms:sent, sms:delivered and sms:failed.
// Every call must carry a valid signature (X-Signature / X-Timestamp, key SMSGATE_SIGNING_KEY); anything else gets 401.
// - sent / delivered / failed: update the outgoing text's status (never goes backwards).
// - received: match the sender to a lead by owner phone (then business phone), save it, log "Text received: …".
//   No match = saved with no lead, shown under Unknown sender in the Texts tab. Nothing is ever replied automatically.
const { send } = require("../_lib");
const sms = require("../_sms");

// Read the raw bytes first: the signature covers them exactly, and touching req.body on Vercel parses (and uses up) the stream.
async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (chunks.length) return Buffer.concat(chunks).toString("utf8");
  return typeof req.body === "string" ? req.body : ""; // already-parsed JSON can't be re-signed exactly, so it fails the check
}
const RANK = { pending: 0, sent: 1, delivered: 2, failed: 3 };
const tail10 = (p) => String(p || "").replace(/\D/g, "").slice(-10);

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  if (!sms.has.signing() || !sms.has.db()) return send(res, 503, { error: "Texting isn't set up yet." });
  const body = await rawBody(req);
  if (!sms.verifySignature(body, req.headers)) return send(res, 401, { error: "Bad signature" });
  let ev;
  try { ev = JSON.parse(body); } catch { return send(res, 400, { error: "Bad JSON" }); }
  const p = ev.payload || {}, now = new Date().toISOString();
  try {
    if (["sms:sent", "sms:delivered", "sms:failed"].includes(ev.event)) {
      const status = ev.event.slice(4);
      const row = ((await sms.sdb(`sms_messages?gateway_message_id=eq.${encodeURIComponent(p.messageId || "")}&direction=eq.out&select=id,status`)) || [])[0];
      if (row && (status === "failed" || RANK[status] > (RANK[row.status] ?? 0))) {
        await sms.sdb(`sms_messages?id=eq.${row.id}`, { method: "PATCH", body: { status, error: status === "failed" ? String(p.reason || "Failed").slice(0, 300) : null, updated_at: now }, prefer: "return=minimal" });
      }
      return send(res, 200, { ok: true, matched: !!row });
    }
    if (ev.event === "sms:received") {
      const gid = String(p.messageId || ev.id || "");
      // The gateway retries until it gets a 2xx: don't save the same text twice.
      if (gid && ((await sms.sdb(`sms_messages?gateway_message_id=eq.${encodeURIComponent(gid)}&direction=eq.in&select=id`)) || []).length) return send(res, 200, { ok: true, duplicate: true });
      const phone = sms.e164(p.sender) || String(p.sender || "unknown");
      const text = String(p.message || "");
      const key = tail10(phone);
      let lead = null;
      if (key.length === 10) {
        const leads = (await sms.sdb("leads?select=id,owner_phone,business_phone&limit=20000")) || [];
        lead = leads.find((l) => tail10(l.owner_phone) === key) || leads.find((l) => tail10(l.business_phone) === key) || null;
      }
      await sms.sdb("sms_messages", { method: "POST", body: { lead_id: lead ? lead.id : null, direction: "in", phone, body: text, status: "received", gateway_message_id: gid || null }, prefer: "return=minimal" });
      if (lead) await sms.sdb("activities", { method: "POST", body: { lead_id: lead.id, kind: "Text", note: `Text received: ${text}` }, prefer: "return=minimal" });
      // STOP-type reply: log the opt-out on the lead (the CRM then turns Send off for them). START opts back in.
      if (lead && (sms.OPT_OUT.test(text) || sms.OPT_IN.test(text))) {
        const out = sms.OPT_OUT.test(text);
        await sms.sdb("activities", { method: "POST", body: { lead_id: lead.id, kind: "Note", outcome: out ? "Opted out of texts" : "Opted back in to texts",
          note: out ? `Opted out of texts: replied "${text.trim()}" from ${phone}. Don't text this lead again.` : `Opted back in to texts: replied "${text.trim()}" from ${phone}.` }, prefer: "return=minimal" });
      }
      return send(res, 200, { ok: true, matched: !!lead });
    }
    send(res, 200, { ok: true, ignored: ev.event || "unknown" });
  } catch (e) {
    send(res, 500, { error: "Couldn't save it" }); // the gateway retries later
  }
};
