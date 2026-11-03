// Builds a campaign email from the subject/body you typed and one contact.
// Shared by the Campaigns tab (preview) and api/campaign-send.js (sending), so the preview is exactly what goes out.
// Merge fields: {firstname} {lastname} {company} {city} {jobtitle}; a fallback after "|", e.g. {firstname|there}.
(function (root) {
  const FIELDS = ["firstname", "lastname", "company", "city", "jobtitle"];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clean = (v) => String(v ?? "").trim();

  function merge(text, contact) {
    return String(text || "").replace(/\{(\w+)(?:\|([^}]*))?\}/g, (m, key, fallback) => {
      if (!FIELDS.includes(key.toLowerCase())) return m;
      const v = clean(contact[key.toLowerCase()]);
      return v || (fallback ?? "");
    });
  }

  // Plain text → simple HTML: blank lines make paragraphs, links become clickable.
  function toHtml(text) {
    return String(text).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p.trim())
      .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`).replace(/\n/g, "<br>")}</p>`).join("");
  }

  // opts: { business, address, unsubUrl }
  function render({ subject, body }, contact, opts) {
    const text = merge(body, contact).trim();
    const footerText = `--\n${opts.business}\n${opts.address}\nDon't want these emails? Unsubscribe: ${opts.unsubUrl}`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1F2937">${toHtml(text)}` +
      `<hr style="border:0;border-top:1px solid #E5E7EB;margin:22px 0 10px">` +
      `<p style="font-size:12px;color:#6B7280;margin:0">${esc(opts.business)}<br>${esc(opts.address)}<br>` +
      `Don't want these emails? <a href="${esc(opts.unsubUrl)}" style="color:#6B7280">Unsubscribe</a></p></div>`;
    return { subject: merge(subject, contact).trim(), html, text: `${text}\n\n${footerText}` };
  }

  // Merge fields used in a subject/body that this contact has no value (and no fallback) for.
  function missing(tpl, contact) {
    const out = new Set();
    `${tpl.subject} ${tpl.body}`.replace(/\{(\w+)(\|[^}]*)?\}/g, (m, key, fb) => {
      if (FIELDS.includes(key.toLowerCase()) && !fb && !clean(contact[key.toLowerCase()])) out.add(key);
    });
    return [...out];
  }

  const api = { FIELDS, merge, render, missing };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AWDCampaignRender = api;
})(this);
