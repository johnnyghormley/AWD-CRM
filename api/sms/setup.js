// /api/sms/setup: admins only. Never returns or logs the credentials themselves.
// GET  → which Vercel variables are set (yes/no) and, when the gateway is set up, the webhooks registered with it.
// POST { action: "register" } → registers the 4 webhooks (sms:received, sms:sent, sms:delivered, sms:failed) pointing at
//      /api/sms/webhook; ones already there are left alone. Run only after Johnathon says his credentials are in Vercel.
const { send, requireAdmin, readJson } = require("../_lib");
const sms = require("../_sms");

const ours = (list) => (Array.isArray(list) ? list : []).filter((w) => w && w.url === sms.WEBHOOK_URL);

module.exports = async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const out = { gateway: sms.has.gateway(), signing: sms.has.signing(), db: sms.has.db(), missing: sms.missing(), webhook_url: sms.WEBHOOK_URL, events: sms.EVENTS };
  if (req.method === "GET") {
    if (out.gateway) {
      try { out.webhooks = ours(await sms.gateway("/webhooks")).map((w) => ({ id: w.id, event: w.event })); }
      catch (e) { out.error = e.message; }
    }
    return send(res, 200, out);
  }
  if (req.method !== "POST") return send(res, 405, { error: "GET or POST" });
  const { action } = await readJson(req).catch(() => ({}));
  if (action !== "register") return send(res, 400, { error: "Unknown action" });
  if (out.missing.length) return send(res, 400, { error: `Add these in Vercel first: ${out.missing.join(", ")}.` });
  try {
    const have = new Set(ours(await sms.gateway("/webhooks")).map((w) => w.event));
    const added = [];
    for (const event of sms.EVENTS) if (!have.has(event)) { await sms.gateway("/webhooks", { method: "POST", body: { url: sms.WEBHOOK_URL, event } }); added.push(event); }
    send(res, 200, { ok: true, added, already: sms.EVENTS.filter((e) => have.has(e)) });
  } catch (e) {
    send(res, 502, { error: e.message });
  }
};
