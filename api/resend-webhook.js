// Resend → CRM tracking: delivered, opened, clicked, bounced, complained, failed.
// Set this URL as a webhook in Resend and put its signing secret in RESEND_WEBHOOK_SECRET (Vercel).
// Bounces and spam complaints are added to the never-email list.
const crypto = require("crypto");
const { env, send, db } = require("./_lib");

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (chunks.length) return Buffer.concat(chunks).toString("utf8");
  return typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
}

// Resend signs webhooks the Svix way: HMAC-SHA256 of "id.timestamp.body" with the base64 secret after "whsec_".
function verified(req, body) {
  const secret = env("RESEND_WEBHOOK_SECRET");
  const id = req.headers["svix-id"], ts = req.headers["svix-timestamp"], sigs = req.headers["svix-signature"] || "";
  if (!secret || !id || !ts) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = crypto.createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(`${id}.${ts}.${body}`).digest("base64");
  return sigs.split(" ").some((s) => {
    const v = s.split(",")[1] || "";
    return v.length === expected.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(expected));
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  const body = await rawBody(req);
  if (!verified(req, body)) return send(res, 401, { error: "Bad signature" });
  try {
    const ev = JSON.parse(body);
    const id = ev.data && ev.data.email_id;
    if (id) await db(null, "rpc/campaign_track", { method: "POST", body: { p_resend_id: id, p_event: ev.type } });
    send(res, 200, { ok: true });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
};

module.exports.verified = verified;
